import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import User from "../models/User.js";

/**
 * Auth routes: register + login return JWT for simplicity.
 */
const router = Router();

// POST /auth/register
router.post("/register", async (req, res) => {
  try {
    const { username, email, name, password, avatar } = req.body;
    if (!username || !email || !name || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const exists = await User.findOne({ $or: [{ username }, { email }] });
    if (exists) {
      return res.status(409).json({ error: "User already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      email,
      name,
      avatar,
      passwordHash,
    });

    const token = jwt.sign(
      { userId: (user._id as Types.ObjectId).toString() },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      token,
      user: {
        id: (user._id as Types.ObjectId).toString(),
        username,
        name,
        email,
        avatar,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: "Register failed" });
  }
});

// POST /auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { userId: (user._id as Types.ObjectId).toString() },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: {
        id: (user._id as Types.ObjectId).toString(),
        username: user.username,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
    });
  } catch {
    return res.status(500).json({ error: "Login failed" });
  }
});

export default router;
