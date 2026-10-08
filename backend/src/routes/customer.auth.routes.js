// src/routes/customer.auth.routes.js

import express from "express";

import { CustomerAuthController } from "../controllers/customer.auth.controller.js";
import {
  validateCustomerLogin,
  validateUpdateCustomer,
} from "../validators/customer.validator.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireCustomer } from "../middlewares/authorize.middleware.js";
import {
  authRateLimiter,
  refreshRateLimiter,
} from "../middlewares/rateLimiter.js";

const router = express.Router();

/**
 * Storefront sign-in (F-01.02), the mirror of /admin/auth.
 *
 * Password only, for now. The FRS also asks for email OTP, which
 * needs an email provider this project has not chosen yet — there is
 * no mailer in package.json and no SMTP config in env. The token this
 * issues is the same shape either way, so adding OTP later is a second
 * route that ends in the same SessionService.open call, not a rewrite.
 */

// ============================================================
// PUBLIC
// ============================================================
//
// authRateLimiter allows 10 attempts per IP per 15 minutes. The
// global limiter (300/15min) is far too loose to slow a
// password-guessing run on its own.
//
// ============================================================

router.post(
  "/login",
  authRateLimiter,
  validateCustomerLogin,
  CustomerAuthController.login,
);

// ============================================================
// COOKIE-AUTHENTICATED
// ============================================================
//
// The mirror of /admin/auth. Neither takes `authenticate`: the
// credential is the httpOnly refresh cookie, and both exist for the
// moment the bearer token has expired.
//
// Refresh has its own limiter, not the login one. Every page a
// returning shopper opens renews once before the header can show them
// as signed in, so browsing the shop generates renewals at browsing
// speed — nothing like the rate a sign-in form does. See
// refreshRateLimiter.
//
// ============================================================

router.post("/refresh", refreshRateLimiter, CustomerAuthController.refresh);

router.post("/logout", CustomerAuthController.logout);

// ============================================================
// PROTECTED
// ============================================================

router.get("/me", authenticate, requireCustomer, CustomerAuthController.me);

// The shopper's own profile (F-05.02 / F-05.06). No `:id` anywhere —
// the row edited is the one the token names, so there is no ownership
// check to write and none to get wrong.
router.put(
  "/me",
  authenticate,
  requireCustomer,
  validateUpdateCustomer,
  CustomerAuthController.updateMe,
);

export default router;
