import dotenv from "dotenv";
dotenv.config();
import express from "express";
import http from "http";
import cors from "cors";
import { connectDB } from "./utils/db";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import convRoutes from "./routes/conversations";
import { initWebsocket } from "./websocket";
import { limiter } from "./middleware/rateLimit";

/**
 * Express app with JWT auth + REST routes.
 * Coupled with Socket.IO for presence and fanout.
 */
const app = express();
app.use(cors());
app.use(express.json());
app.use(limiter);

// health
app.get("/health", (_req, res) => res.json({ ok: true }));

// routes
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/conversations", convRoutes);

// Export app for tests, but create server if run directly
const port = Number(process.env.PORT || 3000);

export const start = async ({ skipDBConnect = false } = {}) => {
  if (!skipDBConnect) {
    await connectDB(
      process.env.MONGO_URI || "mongodb://localhost:27017/chatflow"
    );
  }
  const server = http.createServer(app);
  initWebsocket(server);
  server.listen(port, () => console.log(`API on http://localhost:${port}`));
  return server;
};

// Only start if not required by tests
if (process.env.JEST_WORKER_ID === undefined) {
  start();
}

export default app;
