// src/middlewares/rateLimiter.js

import { createHash } from "node:crypto";

import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { TOKEN_USE } from "../config/auth.policy.js";
import { env } from "../config/env.js";
import { getRedisClient } from "../config/redis.js";
import { ADMIN_TOKEN_TYPE } from "../services/admin.auth.service.js";
import { verifyToken } from "../utils/jwt.js";
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

const createLimiter = ({
  windowMs,
  limit,
  message,
  name,
  prefix,
  skip = null,
  keyGenerator,
  skipSuccessfulRequests = false,
}) => {
  const limiter = rateLimit({
    windowMs,
    limit,
    ...(keyGenerator ? { keyGenerator } : {}),
    // Count only requests answered with an error status — for a sign-in,
    // only the wrong guesses.
    skipSuccessfulRequests,

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

    skip: (req) => env.isTest || Boolean(skip?.(req)),
  });

  return failOpen(limiter, name);
};

const WEBHOOK_PATHS = ["/api/payments/webhook", "/api/whatsapp/webhook"];

export const GLOBAL_LIMIT = 300;
export const ADMIN_GLOBAL_LIMIT = 3000;

/**
 * The admin id behind a request's bearer token, when that token is a
 * validly signed admin *access* token — otherwise null.
 *
 * The global limiter runs before authentication, so on its own it sees
 * only an IP. That put the shop owner's admin panel in the same 300 per
 * 15 minutes as every shopper on the shop's wifi, and a bulk upload of a
 * few dresses' photographs after a normal morning in the panel was
 * answered 429 — photos silently missing on 2 of 3 dresses (2026-10-19).
 *
 * Only the signature and claims are checked here: an HMAC, no database.
 * requireAdmin still re-checks the account on every route, so a token
 * for a deactivated admin buys a bigger budget for requests that are all
 * refused anyway. A forged or expired token fails verification and is
 * counted by IP like any other request. Memoised on the request because
 * the limiter asks twice (its key and its limit).
 */
const adminIdOf = (req) => {
  if (req._rateLimitAdminId !== undefined) return req._rateLimitAdminId;

  let adminId = null;
  const [scheme, token] = String(req.headers.authorization ?? "").trim().split(/\s+/);

  if (scheme?.toLowerCase() === "bearer" && token) {
    try {
      const decoded = verifyToken(token);

      if (decoded?.tok === TOKEN_USE.ACCESS && decoded.typ === ADMIN_TOKEN_TYPE && decoded.sub) {
        adminId = String(decoded.sub);
      }
    } catch {
      // Not a valid token — counted by IP.
    }
  }

  req._rateLimitAdminId = adminId;
  return adminId;
};

export const globalRateLimiter = createLimiter({
  name: "global",
  prefix: "rl:global:",
  windowMs: 15 * 60 * 1000,

  // A signed-in admin gets a budget of their own, keyed by account rather
  // than IP and ten times the size: the panel is many requests per
  // screen, and a bulk upload is one request per product. Everyone else
  // shares the per-IP 300.
  limit: (req) => (adminIdOf(req) ? ADMIN_GLOBAL_LIMIT : GLOBAL_LIMIT),
  keyGenerator: (req) => {
    const adminId = adminIdOf(req);
    return adminId ? `admin:${adminId}` : ipKeyGenerator(req.ip);
  },

  message: "Too many requests. Please try again later.",

  // Server-to-server deliveries, signed with an HMAC checked before
  // anything else runs. Razorpay and Meta send from a handful of IPs, so a
  // busy hour of genuine webhooks would otherwise spend the same per-IP
  // budget and be answered 429 — delayed confirmations for real orders.
  skip: (req) => WEBHOOK_PATHS.includes(req.originalUrl.split("?")[0]),
});

export const authRateLimiter = createLimiter({
  name: "authentication",
  prefix: "rl:auth:",
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: "Too many authentication attempts. Please try again later.",
});

// ------------------------------------------------------------
// The buckets below were split out of `authRateLimiter` (stress test
// LOW-5 / LOW-6, 2026-10-09). With one shared "rl:auth:" key per IP,
// six fumbled storefront passwords plus four order look-ups locked a
// shopper out of tracking their own order, and an admin signing in from
// the shop's wifi shared a budget with every shopper on it. Each flow
// now spends its own budget, sized to how that flow is actually used.
// `authRateLimiter` itself stays as the storefront sign-in bucket.
// ------------------------------------------------------------

/**
 * Admin sign-in.
 *
 * Same size as the storefront's — ten guesses per fifteen minutes is
 * what a password needs — but its own key, so the admin panel's login is
 * never spent by shoppers sharing an IP with the shop, nor the other way
 * round.
 */
export const adminAuthRateLimiter = createLimiter({
  name: "admin-authentication",
  prefix: "rl:auth-admin:",
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: "Too many authentication attempts. Please try again later.",
});

export const ADMIN_ACCOUNT_FAILURE_LIMIT = 5;

/**
 * Admin sign-in, per account rather than per IP.
 *
 * adminAuthRateLimiter above slows one address; it does nothing against
 * guesses spread across many, each staying under ten. This counts the
 * *failed* sign-ins against the account being tried, wherever they come
 * from: five wrong passwords in fifteen minutes and that account refuses
 * further attempts until the window has passed. A successful sign-in is
 * not counted, so the owner mistyping once costs nothing.
 *
 * The trade-off, accepted knowingly: someone who knows the admin email
 * can keep the account locked by guessing on purpose. Fifteen minutes is
 * short enough that this is a nuisance rather than an outage, and the
 * alternative — unlimited distributed guessing — is worse.
 *
 * Keyed by a hash of the email so no address is written into Redis.
 */
export const adminAccountLockout = createLimiter({
  name: "admin-account-lockout",
  prefix: "rl:auth-admin-account:",
  windowMs: 15 * 60 * 1000,
  limit: ADMIN_ACCOUNT_FAILURE_LIMIT,
  skipSuccessfulRequests: true,
  message:
    "Too many failed sign-ins for this account. Please wait 15 minutes and try again.",
  keyGenerator: (req) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();

    return email
      ? `account:${createHash("sha256").update(email).digest("hex").slice(0, 32)}`
      : ipKeyGenerator(req.ip);
  },
});

/**
 * Registration (F-05.01).
 *
 * Every accepted call costs a bcrypt hash at cost 12 (~250 ms of CPU)
 * and an INSERT, and until now only the global 300 / 15 min applied —
 * enough for one IP to keep a core busy and fill the customers table
 * with junk accounts. Ten an IP per fifteen minutes is a household
 * signing up several people with room to spare.
 */
export const registerRateLimiter = createLimiter({
  name: "register",
  prefix: "rl:register:",
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: "Too many sign-up attempts. Please try again in a few minutes.",
});

/**
 * Completing a password reset from the emailed link.
 *
 * Its own bucket rather than the sign-in one: a shopper who has just
 * failed to sign in a few times is exactly the person who then resets,
 * and should not find the reset form already spent. Guessing a 256-bit
 * token is not a realistic attack, so this only needs to stop the form
 * being hammered — and each attempt costs a bcrypt hash.
 */
export const resetPasswordRateLimiter = createLimiter({
  name: "reset-password",
  prefix: "rl:pwreset-confirm:",
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: "Too many password reset attempts. Please try again in a few minutes.",
});

/**
 * Guest order tracking (order number + email/phone).
 *
 * The pair is a weak credential, so it is still limited — but it is not
 * a password, and the person using it is often a guest refreshing the
 * page while waiting on a parcel. Thirty per fifteen minutes allows
 * that, while keeping enumeration of order numbers impractical.
 *
 * Exported for order.routes.js, which mounts it on POST /trackOrder.
 */
export const trackOrderRateLimiter = createLimiter({
  name: "track-order",
  prefix: "rl:track:",
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: "Too many order look-ups. Please try again in a few minutes.",
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
 * "Forgot password".
 *
 * Its own bucket, and tighter than sign-in: every accepted request can
 * send an email, so this is the limiter that stops the form being used
 * to flood an inbox or burn the Resend quota. Five per fifteen minutes is
 * more than a shopper who mistyped their address twice will ever need.
 */
export const passwordResetRateLimiter = createLimiter({
  name: "password-reset",
  prefix: "rl:pwreset:",
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: "Too many password reset requests. Please try again in a few minutes.",
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
