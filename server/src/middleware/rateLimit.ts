import rateLimit from "express-rate-limit";

/**
 * Global rate limiter. Tune via env.
 */
const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000); // default 60 seconds
const max = Number(process.env.RATE_LIMIT_MAX || 120); // default 120 requests

export const limiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});
