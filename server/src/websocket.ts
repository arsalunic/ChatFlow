import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import Conversation from "./models/Conversation.js";
import User from "./models/User.js";
import Message from "./models/Message.js";

/**
 * Socket.IO for presence + new message fanout + delivery acks.
 *
 * Exposes:
 *  - initWebsocket(httpServer)
 *  - getIO() -> Server instance (throws if not initialized)
 *  - addUsersToRoom(userIds: string[], roomId: string)
 */

let io: Server | null = null;

// Map<userId, Set<socketId>>
const userToSockets = new Map<string, Set<string>>();

function addSocketForUser(userId: string, socketId: string) {
  const s = userToSockets.get(userId) ?? new Set<string>();
  s.add(socketId);
  userToSockets.set(userId, s);
}

function removeSocketForUser(userId: string, socketId: string) {
  const s = userToSockets.get(userId);
  if (!s) return;
  s.delete(socketId);
  if (s.size === 0) userToSockets.delete(userId);
  else userToSockets.set(userId, s);
}

/** Make all sockets for the given users join the room */
export const addUsersToRoom = (userIds: string[], roomId: string) => {
  if (!io) return;
  userIds.forEach((uid) => {
    const sockets = userToSockets.get(uid);
    if (!sockets) return;
    sockets.forEach((sid) => {
      const s = io!.sockets.sockets.get(sid);
      if (s) s.join(roomId);
    });
  });
};

export const getIO = (): Server => {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
};

async function broadcastOnlineUsers() {
  if (!io) return;
  const userIds = Array.from(userToSockets.keys());
  if (userIds.length === 0) {
    io.emit("onlineUsers", []);
    return;
  }
  const users = await User.find({ _id: { $in: userIds } })
    .select("username")
    .lean();
  const usernames = users.map((u) => u.username);
  io.emit("onlineUsers", usernames);
}

export const initWebsocket = (httpServer: any) => {
  io = new Server(httpServer, { path: "/ws", cors: { origin: "*" } });

  io.on("connection", async (socket) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        socket.disconnect();
        return;
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET as string) as {
        userId: string;
      };
      const userId = payload.userId;

      // record socket
      addSocketForUser(userId, socket.id);

      // mark online & join all existing conversation rooms
      await User.findByIdAndUpdate(userId, { online: true });
      const convs = await Conversation.find(
        { participants: userId },
        { _id: 1 }
      ).lean();
      convs.forEach((c) => socket.join(c._id.toString()));

      // presence snapshots
      socket.broadcast.emit("presence:update", { userId, online: true });
      await broadcastOnlineUsers();

      // Optional: dynamically join new rooms when UI opens a thread
      socket.on("conversation:join", async (conversationId: string) => {
        if (!conversationId) return;
        const conv = await Conversation.findById(conversationId)
          .select("_id participants")
          .lean();
        if (!conv) return;
        const isMember = conv.participants.some(
          (p: any) => p.toString() === userId
        );
        if (!isMember) return;
        socket.join(conv._id.toString());
      });

      // message passthrough (if a client chooses to emit directly)
      socket.on("message:send", (payload: any) => {
        if (!io) return;
        if (!payload?.conversationId) return;
        io.to(payload.conversationId).emit("message:new", payload);
      });

      /**
       * NEW: Delivery acknowledgment
       * Client (receiver) emits this immediately after rendering a new message.
       * Server marks message as delivered and notifies the room.
       */
      socket.on(
        "message:delivered",
        async (data: { messageId: string; conversationId?: string }) => {
          try {
            const { messageId, conversationId } = data || {};
            if (!messageId) return;

            const msg = await Message.findById(messageId)
              .select("_id conversationId status")
              .lean();

            if (!msg) return;

            const convId = (conversationId || msg.conversationId)?.toString();
            if (!convId) return;

            // Ensure the acker is a participant
            const conv = await Conversation.findById(convId)
              .select("_id participants")
              .lean();
            if (!conv) return;

            const isMember = conv.participants.some(
              (p: any) => p.toString() === userId
            );
            if (!isMember) return;

            // Only bump sent -> delivered
            await Message.updateOne(
              { _id: msg._id, status: "sent" },
              { $set: { status: "delivered" } }
            );

            // Emit a minimal status update to the whole room
            getIO().to(convId).emit("message:status", {
              _id: msg._id.toString(),
              status: "delivered",
            });
          } catch (err) {
            // swallow per-message errors to avoid killing the socket
          }
        }
      );

      // typing indicators
      socket.on(
        "typing",
        (data: { conversationId: string; username: string }) => {
          if (!data?.conversationId) return;
          socket.to(data.conversationId).emit("typing", data.username);
        }
      );

      socket.on("disconnect", async () => {
        removeSocketForUser(userId, socket.id);

        const stillOnline = userToSockets.has(userId);
        if (!stillOnline) {
          await User.findByIdAndUpdate(userId, {
            online: false,
            lastOnline: new Date(),
          });
        }

        socket.broadcast.emit("presence:update", {
          userId,
          online: stillOnline ? true : false,
          lastOnline: stillOnline ? undefined : new Date(),
        });
        await broadcastOnlineUsers();
      });
    } catch (err) {
      console.error("Socket auth/connection error", err);
      socket.disconnect();
    }
  });

  return io;
};
