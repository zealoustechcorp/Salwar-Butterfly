import express from "express";

import { AdminAuthController } from "../controllers/admin.auth.controller.js";
import { validateAdminLogin } from "../validators/admin.validator.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/authorize.middleware.js";
import { authRateLimiter } from "../middlewares/rateLimiter.js";

const router = express.Router();

// ============================================================
// PUBLIC
// ============================================================
//
// authRateLimiter allows 10 attempts per IP per 15 minutes. The
// global limiter (300/15min) is far too loose to slow down a
// password-guessing run on its own.
//
// ============================================================

router.post(
  "/login",
  authRateLimiter,
  validateAdminLogin,
  AdminAuthController.login,
);

// ============================================================
// PROTECTED
// ============================================================

router.get("/me", authenticate, requireAdmin, AdminAuthController.me);

router.post("/logout", authenticate, requireAdmin, AdminAuthController.logout);

export default router;
