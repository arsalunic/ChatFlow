import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import mongoose from "mongoose";
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
    ids.map((i) => i.toString()),
    conv._id.toString()
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
    getIO().to(conv._id.toString()).emit("conversation:new", populated);
  } catch (e) {
    // getIO may not be available during tests / startup; ignore safely
    console.warn("getIO not available when emitting conversation:new", e);
  }

  res.status(201).json(populated);
});

// GET /conversations/:id/messages - history
router.get("/:id/messages", authMiddleware, async (req: AuthRequest, res) => {
  const convId = new mongoose.Types.ObjectId(req.params.id);
  const messages = await Message.find({ conversationId: convId })
    .sort({ createdAt: 1 })
    .lean();
  const shaped = messages.map((m) => ({
    _id: m._id,
    senderId: m.senderId,
    createdAt: m.createdAt,
    status: m.status,
    text: decrypt(m.textEncrypted),
  }));
  res.json(shaped);
});

// POST /conversations/:id/messages - send (save + realtime emit)
router.post("/:id/messages", authMiddleware, async (req: AuthRequest, res) => {
  const convId = new mongoose.Types.ObjectId(req.params.id);
  const { text } = req.body as { text: string };
  if (!text) return res.status(400).json({ error: "Text required" });
  const msg = await Message.create({
    conversationId: convId,
    senderId: new mongoose.Types.ObjectId(req.userId),
    textEncrypted: encrypt(text),
    status: "sent",
  });

  // shape payload for clients (decrypted text included to display immediately)
  const payload = {
    _id: msg._id.toString(),
    conversationId: convId.toString(),
    senderId: msg.senderId.toString(),
    createdAt: msg.createdAt,
    status: msg.status,
    text,
  };

  // emit to the conversation room
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
  await Message.updateMany(
    { conversationId: convId, status: "sent" },
    { $set: { status: "delivered" } }
  );
  res.json({ ok: true });
});

// GET /conversations/search/all?q=term - naive search (decrypt messages server-side)
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

export default router;
