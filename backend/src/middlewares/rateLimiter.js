// src/middlewares/rateLimiter.js

import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const createLimiter = ({ windowMs, limit, message, name }) =>
  rateLimit({
    windowMs,
    limit,

    standardHeaders: "draft-8",
    legacyHeaders: false,

    message: {
      success: false,
      code: "RATE_LIMIT_EXCEEDED",
      message,
    },

    handler: (req, res, next, options) => {
      logger.warn("Rate limit exceeded", {
        limiter: name,
        ip: req.ip,
        method: req.method,
        path: req.originalUrl,
      });

      res.status(options.statusCode).json(options.message);
    },

    skip: () => env.isTest,
  });

export const globalRateLimiter = createLimiter({
  name: "global",
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: "Too many requests. Please try again later.",
});

export const authRateLimiter = createLimiter({
  name: "authentication",
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: "Too many authentication attempts. Please try again later.",
});
