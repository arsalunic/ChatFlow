import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import Conversation from "./models/Conversation.js";
import User from "./models/User.js";

/**
 * Socket.IO for presence + new message fanout.
 *
 * Exposes:
 *  - initWebsocket(httpServer)
 *  - getIO() -> Server instance (throws if not initialized)
 *  - addUsersToRoom(userIds: string[], roomId: string)
 */

let io: Server | null = null;

// track which userIds have which socketIds
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
  // derive usernames of currently connected users
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

      // mark online in DB (optional) and join all existing conversation rooms
      await User.findByIdAndUpdate(userId, { online: true });
      const convs = await Conversation.find(
        { participants: userId },
        { _id: 1 }
      ).lean();
      convs.forEach((c) => socket.join(c._id.toString()));

      // broadcast presence (incremental) and full online snapshot
      socket.broadcast.emit("presence:update", { userId, online: true });
      await broadcastOnlineUsers();

      // message passthrough: if some client choses to emit directly
      socket.on("message:send", (payload: any) => {
        if (!io) return;
        io.to(payload.conversationId).emit("message:new", payload);
      });

      // typing indicators to room (sender excluded automatically)
      socket.on(
        "typing",
        (data: { conversationId: string; username: string }) => {
          socket.to(data.conversationId).emit("typing", data.username);
        }
      );

      socket.on("disconnect", async () => {
        removeSocketForUser(userId, socket.id);

        // if the user has no more sockets, mark offline in DB
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
