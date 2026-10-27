import express from "express";

import { AdminAuthController } from "../controllers/admin.auth.controller.js";
import { validateAdminLogin } from "../validators/admin.validator.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/authorize.middleware.js";
import {
  adminAccountLockout,
  adminAuthRateLimiter,
  refreshRateLimiter,
} from "../middlewares/rateLimiter.js";

const router = express.Router();

// ============================================================
// PUBLIC
// ============================================================
//
// adminAuthRateLimiter allows 10 attempts per IP per 15 minutes. The
// global limiter (300/15min) is far too loose to slow down a
// password-guessing run on its own. Its own bucket, not the
// storefront's — see rateLimiter.js (LOW-6). adminAccountLockout adds a
// per-account cap on failed attempts, which an IP limit cannot give.
//
// ============================================================

router.post(
  "/login",
  adminAuthRateLimiter,
  // Per account, counting only failures — see rateLimiter.js.
  adminAccountLockout,
  validateAdminLogin,
  AdminAuthController.login,
);

// ============================================================
// COOKIE-AUTHENTICATED
// ============================================================
//
// Neither of these takes `authenticate`, and that is deliberate on
// both. The credential is the httpOnly refresh cookie, not a bearer
// token, and both exist for the moment the bearer token has expired —
// guarding them with `authenticate` would make them unreachable exactly
// when they are needed.
//
// Nothing is authorised here beyond renewing or ending the session
// whose cookie was presented, and the session service verifies that
// cookie before it acts on it.
//
// Refresh gets its own limiter rather than sharing the login one. A
// page load renews before it can tell whether anybody is signed in, so
// ten per fifteen minutes — the right budget for password guesses —
// would lock an admin out for reloading a screen ten times. See
// refreshRateLimiter for the numbers.
//
// ============================================================

router.post("/refresh", refreshRateLimiter, AdminAuthController.refresh);

router.post("/logout", AdminAuthController.logout);

// ============================================================
// PROTECTED
// ============================================================

router.get("/me", authenticate, requireAdmin, AdminAuthController.me);

export default router;
