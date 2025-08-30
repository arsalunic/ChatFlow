// server/src/routes/conversations.ts
import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import { Types } from "mongoose";
import { decrypt, encrypt } from "../utils/crypto.js";
import { addUsersToRoom, getIO } from "../websocket.js"; // <--- import helpers

const router = Router();

// GET /conversations - list user's conversations with last message + presence summaries
router.get("/", authMiddleware, async (req: AuthRequest, res) => {
  const userId = new mongoose.Types.ObjectId(req.userId);
  const convs = await Conversation.aggregate([
    { $match: { participants: userId } },
    {
      $lookup: {
        from: "users",
        localField: "participants",
        foreignField: "_id",
        as: "participants",
      },
    },
    {
      $lookup: {
        from: "messages",
        let: { convId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$conversationId", "$$convId"] } } },
          { $sort: { createdAt: -1 } },
          { $limit: 1 },
        ],
        as: "lastMessage",
      },
    },
    { $unwind: { path: "$lastMessage", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        isGroup: 1,
        name: 1,
        participants: {
          _id: 1,
          username: 1,
          name: 1,
          avatar: 1,
          online: 1,
          lastOnline: 1,
        },
        lastMessage: { textEncrypted: 1, createdAt: 1, senderId: 1, status: 1 },
      },
    },
    { $sort: { "lastMessage.createdAt": -1, updatedAt: -1 } },
  ]);

  const shaped = convs.map((c) => ({
    _id: c._id,
    isGroup: c.isGroup,
    name: c.name,
    participants: c.participants,
    lastMessage: c.lastMessage
      ? {
          text: c.lastMessage.textEncrypted
            ? decrypt(c.lastMessage.textEncrypted)
            : "",
          createdAt: c.lastMessage.createdAt,
          senderId: c.lastMessage.senderId,
          status: c.lastMessage.status,
        }
      : null,
  }));

  res.json(shaped);
});

// POST /conversations - create DM or Group
router.post("/", authMiddleware, async (req: AuthRequest, res) => {
  const { participantUsernames, name } = req.body as {
    participantUsernames: string[];
    name?: string;
  };
  if (!participantUsernames || participantUsernames.length < 1)
    return res.status(400).json({ error: "Participants required" });

  const me = await User.findById(req.userId);
  const others = await User.find({ username: { $in: participantUsernames } });
  const ids = [me!._id, ...others.map((u) => u._id)];
  const isGroup = ids.length >= 3;
  if (isGroup && !name)
    return res.status(400).json({ error: "Group name required" });

  const conv = await Conversation.create({ participants: ids, isGroup, name });

  // make currently-connected sockets join the new room
  addUsersToRoom(
    ids.map((i) => (i as Types.ObjectId).toString()),
    (conv._id as Types.ObjectId).toString()
  );

  // populate participants for client convenience
  const populated = await Conversation.findById(conv._id)
    .populate({
      path: "participants",
      select: "username name avatar online lastOnline",
    })
    .lean();

  // emit new conversation to participants (they will update list without reload)
  try {
    getIO()
      .to((conv._id as Types.ObjectId).toString())
      .emit("conversation:new", populated);
  } catch (e) {
    // getIO may not be available during tests / startup; ignore safely
    console.warn("getIO not available when emitting conversation:new", e);
  }

  res.status(201).json(populated);
});

// GET /conversations/:id/messages - history (with parent message for replies)
router.get("/:id/messages", authMiddleware, async (req: AuthRequest, res) => {
  const convId = new mongoose.Types.ObjectId(req.params.id);
  const messages = await Message.find({ conversationId: convId })
    .sort({ createdAt: 1 })
    .lean();

  // Fetch parent messages for replies
  const parentIds = messages
    .filter((m) => m.parentMessageId)
    .map((m) => m.parentMessageId);
  const parents =
    parentIds.length > 0
      ? await Message.find({ _id: { $in: parentIds } }).lean()
      : [];
  const parentMap = new Map(
    parents.map((p) => [
      p._id.toString(),
      { ...p, text: decrypt(p.textEncrypted) },
    ])
  );

  const shaped = messages.map((m) => ({
    _id: m._id,
    senderId: m.senderId,
    createdAt: m.createdAt,
    status: m.status,
    text: decrypt(m.textEncrypted),
    reactions: m.reactions || [],
    parent: m.parentMessageId
      ? parentMap.get((m.parentMessageId as any).toString())
      : null,
  }));

  res.json(shaped);
});

// POST /conversations/:id/messages - send message (with optional replyTo)
router.post("/:id/messages", authMiddleware, async (req: AuthRequest, res) => {
  const convId = new mongoose.Types.ObjectId(req.params.id);
  const { text, replyTo } = req.body as { text: string; replyTo?: string };
  if (!text) return res.status(400).json({ error: "Text required" });

  const msgData: any = {
    conversationId: convId,
    senderId: new mongoose.Types.ObjectId(req.userId),
    textEncrypted: encrypt(text),
    status: "sent",
  };
  if (replyTo) msgData.parentMessageId = new mongoose.Types.ObjectId(replyTo);

  const msg = await Message.create(msgData);

  const payload = {
    _id: (msg._id as Types.ObjectId).toString(),
    conversationId: convId.toString(),
    senderId: msg.senderId.toString(),
    createdAt: msg.createdAt,
    status: msg.status,
    text,
    parentMessageId: msg.parentMessageId
      ? msg.parentMessageId.toString()
      : null,
  };

  try {
    getIO().to(convId.toString()).emit("message:new", payload);
  } catch (e) {
    console.warn("getIO not available when emitting message:new", e);
  }

  res.status(201).json({ _id: msg._id, createdAt: msg.createdAt });
});

// POST /conversations/:id/delivered - mark all as delivered for requester
router.post("/:id/delivered", authMiddleware, async (req: AuthRequest, res) => {
  const convId = new mongoose.Types.ObjectId(req.params.id);
  // Update DB
  await Message.updateMany(
    { conversationId: convId, status: "sent" },
    { $set: { status: "delivered" } }
  );

  // Fetch updated message ids so we can emit them in an event to clients
  try {
    const updated = await Message.find({
      conversationId: convId,
      status: "delivered",
    })
      .select("_id")
      .lean();
    const messageIds = updated.map((m) => m._id.toString());
    // Emit the delivered event to the conversation room so all clients can update their UI
    try {
      getIO().to(convId.toString()).emit("message:delivered", {
        conversationId: convId.toString(),
        messageIds,
      });
    } catch (e) {
      console.warn("getIO not available when emitting message:delivered", e);
    }
  } catch (e) {
    console.warn("Error while emitting delivered messages", e);
  }

  res.json({ ok: true });
});

// GET /conversations/:id/messages/search?q=term
router.get(
  "/:id/messages/search",
  authMiddleware,
  async (req: AuthRequest, res) => {
    const convId = new mongoose.Types.ObjectId(req.params.id);
    const q = String(req.query.q || "").toLowerCase();
    if (!q) return res.json([]);

    const messages = await Message.find({ conversationId: convId })
      .limit(500)
      .lean();
    const shaped = messages
      .map((m) => ({ ...m, text: decrypt(m.textEncrypted) }))
      .filter((m) => m.text.toLowerCase().includes(q))
      .map((m) => ({
        _id: m._id,
        senderId: m.senderId,
        createdAt: m.createdAt,
        status: m.status,
        text: m.text,
      }));

    res.json(shaped);
  }
);

// GET /conversations/search/all?q=term
router.get("/search/all", authMiddleware, async (req: AuthRequest, res) => {
  const q = String(req.query.q || "").toLowerCase();
  if (!q) return res.json([]);

  const myId = new mongoose.Types.ObjectId(req.userId);
  const convs = await Conversation.find(
    { participants: myId },
    { _id: 1 }
  ).lean();
  const convIds = convs.map((c) => c._id);

  const msgs = await Message.find({ conversationId: { $in: convIds } })
    .limit(500)
    .lean();
  const results = msgs
    .map((m) => ({ ...m, text: decrypt(m.textEncrypted) }))
    .filter((m) => m.text.toLowerCase().includes(q))
    .map((m) => ({
      _id: m._id,
      conversationId: m.conversationId,
      createdAt: m.createdAt,
      text: m.text,
    }));

  res.json(results);
});

// POST /conversations/:id/messages/:msgId/reactions
router.post(
  "/:id/messages/:msgId/react",
  authMiddleware,
  async (req: AuthRequest, res) => {
    const { emoji } = req.body;
    const userId = req.userId;
    const msgId = req.params.msgId;
    if (!emoji) return res.status(400).json({ error: "Emoji required" });

    const msg = await Message.findById(msgId);
    if (!msg) return res.status(404).json({ error: "Message not found" });

    const existingIndex = msg.reactions?.findIndex(
      (r) => r.userId.toString() === userId && r.emoji === emoji
    );
    if (existingIndex !== undefined && existingIndex > -1) {
      msg.reactions!.splice(existingIndex, 1);
    } else {
      msg.reactions = msg.reactions || [];
      msg.reactions.push({
        userId: new mongoose.Types.ObjectId(userId),
        emoji,
      });
    }

    await msg.save();

    try {
      getIO()
        .to(req.params.id)
        .emit("message:react", { msgId, reactions: msg.reactions });
    } catch {}

    res.json({ msgId, reactions: msg.reactions });
  }
);

export default router;
