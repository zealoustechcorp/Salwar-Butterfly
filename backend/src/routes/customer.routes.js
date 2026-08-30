// src/routes/customer.routes.js

import express from "express";

import { CustomerController } from "../controllers/customer.controller.js";

import { authenticate } from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/authorize.middleware.js";
import { authRateLimiter } from "../middlewares/rateLimiter.js";

import {
  validateCreateCustomer,
  validateCustomerIdParam,
  validateCustomerQuery,
  validateUpdateCustomer,
  validateChangePassword,
} from "../validators/customer.validator.js";

const router = express.Router();

/**
 * Access control for F-05.05, and it is the whole reason this file
 * reads the way it does.
 *
 * A customer record is personal data — a name, an email, a phone
 * number. Everything that reads or writes one is therefore behind an
 * admin token, and the two exceptions are deliberate:
 *
 *   /register         a person signing up has no token yet, by
 *                     definition. It is the one public route here.
 *
 *   /change-password  self-service, so an admin token is the wrong
 *                     key for it. It stays open, but only because
 *                     there is no customer token to demand yet
 *                     (F-01.02) — see the note on the route itself.
 */

// ============================================================
// PUBLIC
// ============================================================

// Register customer (F-05.01)
router.post("/register", validateCreateCustomer, CustomerController.register);

/**
 * Change password (F-05.06).
 *
 * Rate-limited rather than authenticated, which is a stopgap and not a
 * design: knowing a customer id, this endpoint lets an attacker guess
 * `oldPassword` at HTTP speed. The limiter is what stands in for the
 * missing check until customer login lands, at which point this route
 * takes `authenticate` plus an "is this your own id?" guard and the
 * limiter becomes the second line rather than the first.
 */
router.post(
  "/:id/change-password",
  authRateLimiter,
  validateCustomerIdParam,
  validateChangePassword,
  CustomerController.changePassword,
);

// ============================================================
// ADMIN ONLY
// ============================================================

// Admin customer listing (F-05.04) — paginated, searchable, sorted.
router.get(
  "/getAllCustomers",
  authenticate,
  requireAdmin,
  validateCustomerQuery,
  CustomerController.getAll,
);

// Admin customer details (F-05.04)
router.get(
  "/getCustomerById/:id",
  authenticate,
  requireAdmin,
  validateCustomerIdParam,
  CustomerController.getById,
);

// Update customer (F-05.06)
router.put(
  "/updateCustomer/:id",
  authenticate,
  requireAdmin,
  validateCustomerIdParam,
  validateUpdateCustomer,
  CustomerController.update,
);

// Soft delete — the row is kept, so an order that points at this
// customer still has a customer to point at.
router.delete(
  "/deleteCustomer/:id",
  authenticate,
  requireAdmin,
  validateCustomerIdParam,
  CustomerController.delete,
);

export default router;
