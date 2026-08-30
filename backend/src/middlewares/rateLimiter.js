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

/**
 * Checkout (F-07.01).
 *
 * Placing an order is open to guests, opens a transaction and takes a
 * row lock on every variant in the bag. The global limiter's 300 per
 * fifteen minutes is far too loose for that: a loop against it would
 * reserve the whole catalogue's stock into abandoned orders and take
 * the shop off sale without ever paying for anything.
 *
 * Twenty is well above what a real shopper does — a couple of attempts
 * if a card fails — and well below what a script needs to be useful.
 */
export const checkoutRateLimiter = createLimiter({
  name: "checkout",
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: "Too many checkout attempts. Please try again in a few minutes.",
});
