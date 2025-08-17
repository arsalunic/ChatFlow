import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import User from "../models/User.js";

/** User profile routes (minimal for take-home). */
const router = Router();

router.get("/me", authMiddleware, async (req: AuthRequest, res) => {
  const user = await User.findById(req.userId).select("-passwordHash");
  if (!user) return res.status(404).json({ error: "Not found" });
  return res.json(user);
});

/**
 * GET /users - list all users (minimal info for chat/presence)
 */
router.get("/", authMiddleware, async (req, res) => {
  const users = await User.find(
    {},
    { _id: 1, username: 1, name: 1, online: 1 }
  ).lean();
  res.json(users);
});

export default router;
