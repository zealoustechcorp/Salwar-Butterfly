// src/middlewares/rateLimiter.js

import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { env } from "../config/env.js";
import { getRedisClient } from "../config/redis.js";
import { logger } from "../utils/logger.js";

/**
 * Where the counters live.
 *
 * With Redis configured they are shared by every instance and survive a
 * restart, which is the only arrangement under which the numbers below
 * mean what they say. Without it, express-rate-limit's default in-memory
 * store: counters in this process's heap, reset by every deploy and
 * counted separately by every container. That is correct on a laptop —
 * there is one process — and it is why local development needs no
 * infrastructure at all. env.js is what warns when production ends up
 * here by accident.
 *
 * Tests skip the limiters entirely (see `skip` below), so there is no
 * reason to open a connection for them.
 *
 * @param {string} prefix  keyspace for this limiter, e.g. "rl:auth:".
 *   Distinct per limiter so a shopper's login attempts and their
 *   checkout attempts are counted separately rather than sharing one
 *   key for their IP.
 */
const createStore = (prefix) => {
  if (!env.redis.enabled || env.isTest) return undefined;

  return new RedisStore({
    prefix,
    // rate-limit-redis speaks Redis through whichever client it is
    // handed; `call` is ioredis's generic command method.
    sendCommand: (...args) => getRedisClient().call(...args),
  });
};

const OUTAGE_LOG_INTERVAL_MS = 30_000;

/**
 * Let a request through when the store itself failed.
 *
 * The only errors a limiter passes to `next` are its store's, and with a
 * Redis store that means Redis was unreachable. The choice is then
 * between refusing every request until it comes back — a cache outage
 * escalated into a shop outage — and not counting for the duration.
 *
 * Letting them through is the lesser harm, but it is a real one: this is
 * the window in which the checkout limiter is not defending anything, so
 * it is logged at error level rather than passed over in silence.
 */
const failOpen = (limiter, name) => {
  // An outage affects every request, and the global limiter sees all of
  // them, so logging per request would fill the day's error log with one
  // repeated sentence and bury whatever else went wrong that afternoon.
  // One line every thirty seconds carries the same information: the
  // count is what turns it from an anecdote into a duration.
  let suppressed = 0;
  let lastLoggedAt = 0;

  return (req, res, next) =>
    limiter(req, res, (err) => {
      if (!err) return next();

      const now = Date.now();

      if (now - lastLoggedAt >= OUTAGE_LOG_INTERVAL_MS) {
        logger.error("Rate limiter store unavailable — requests not counted", {
          limiter: name,
          message: err.message,
          path: req.originalUrl,
          alsoSuppressed: suppressed,
        });

        lastLoggedAt = now;
        suppressed = 0;
      } else {
        suppressed += 1;
      }

      next();
    });
};

const createLimiter = ({ windowMs, limit, message, name, prefix }) => {
  const limiter = rateLimit({
    windowMs,
    limit,

    store: createStore(prefix),

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

  return failOpen(limiter, name);
};

export const globalRateLimiter = createLimiter({
  name: "global",
  prefix: "rl:global:",
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: "Too many requests. Please try again later.",
});

export const authRateLimiter = createLimiter({
  name: "authentication",
  prefix: "rl:auth:",
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: "Too many authentication attempts. Please try again later.",
});

/**
 * Session renewal.
 *
 * Separate from the auth limiter, and it has to be. Renewal and sign-in
 * look alike — both unauthenticated, both on the auth router — but they
 * are used at completely different rates, and sharing one bucket means
 * the tighter of the two rules governs both.
 *
 * An access token lasts fifteen minutes, so every open tab renews about
 * four times an hour, and every page load renews once before it can
 * decide whether anybody is signed in. Ten per fifteen minutes — right
 * for password attempts — would therefore be spent by an admin
 * reloading a screen ten times, or by half a dozen tabs left open
 * overnight, and the reward for ordinary work would be a lockout from
 * their own session.
 *
 * Sixty is far above what a person generates and far below what a
 * script replaying a stolen cookie would want. The real defence against
 * that is rotation — a replayed refresh token revokes the family on the
 * first attempt, so there is no volume to grind through anyway. This
 * limit is only here to stop an unauthenticated endpoint that touches
 * Postgres from being free to hammer.
 */
export const refreshRateLimiter = createLimiter({
  name: "refresh",
  prefix: "rl:refresh:",
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: "Too many session renewals. Please try again in a few minutes.",
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
  prefix: "rl:checkout:",
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: "Too many checkout attempts. Please try again in a few minutes.",
});
