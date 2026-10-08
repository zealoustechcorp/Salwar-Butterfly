// src/routes/customer.routes.js

import express from "express";

import { CustomerController } from "../controllers/customer.controller.js";

import { authenticate } from "../middlewares/auth.middleware.js";
import {
  requireAdmin,
  requireCustomer,
  requireSelf,
} from "../middlewares/authorize.middleware.js";
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
 *   /change-password  behind a *customer* token plus an ownership
 *                     check, not an admin one — see the route.
 *
 * Signing in lives next door in customer.auth.routes.js, mounted at
 * /customers/auth, mirroring /admin/auth.
 */

// ============================================================
// PUBLIC
// ============================================================

// Register customer (F-05.01)
router.post("/register", validateCreateCustomer, CustomerController.register);

// ============================================================
// CUSTOMER'S OWN ACCOUNT
// ============================================================

/**
 * Change password (F-05.06).
 *
 * Three checks, and each one is load-bearing:
 *
 *   authenticate     proves who is asking.
 *   requireCustomer  refuses an admin token — an admin who could set
 *                    a customer's password could sign in as them.
 *   requireSelf      proves the id in the URL is the caller's own.
 *
 * The rate limiter stays as the second line. The old password is
 * still required, so this remains a guessing surface, just one that
 * an attacker must first own an account to reach.
 */
router.post(
  "/:id/change-password",
  authenticate,
  requireCustomer,
  validateCustomerIdParam,
  requireSelf("id"),
  authRateLimiter,
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
