// src/middlewares/authorize.middleware.js

import { ApiError } from "../utils/ApiError.js";
import { ADMIN_ROLES } from "../models/admin.entity.js";
import { ADMIN_TOKEN_TYPE } from "../services/admin.auth.service.js";
import { CUSTOMER_TOKEN_TYPE } from "../services/customer.auth.service.js";
import { logger } from "../utils/logger.js";

/**
 * Authorization middlewares.
 *
 * These always run AFTER `authenticate`, which populates req.user
 * from the verified JWT. On its own, `authenticate` only proves the
 * token is genuine — it says nothing about what the bearer may do.
 */

// ============================================================
// REQUIRE ADMIN
// ============================================================

/**
 * Gate a route behind an admin token.
 *
 * The `typ` check is the important one. Every token in this system
 * is signed with the same JWT_SECRET, so without it a storefront
 * customer token would verify perfectly well against an admin
 * route — the signature is valid, only the audience is wrong.
 */
export const requireAdmin = (req, res, next) => {
  const user = req.user;

  if (!user) {
    throw ApiError.unauthorized("Authentication required", "UNAUTHORIZED");
  }

  if (user.typ !== ADMIN_TOKEN_TYPE) {
    logger.warn("Non-admin token presented to an admin route", {
      userId: user.id,
      typ: user.typ,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
    });

    throw ApiError.forbidden(
      "You do not have permission to perform this action",
      "ADMIN_REQUIRED",
    );
  }

  if (!Object.values(ADMIN_ROLES).includes(user.role)) {
    logger.warn("Admin token carried an unrecognized role", {
      userId: user.id,
      role: user.role,
      method: req.method,
      path: req.originalUrl,
    });

    throw ApiError.forbidden(
      "You do not have permission to perform this action",
      "ADMIN_ROLE_INVALID",
    );
  }

  next();
};

// ============================================================
// REQUIRE CUSTOMER
// ============================================================

/**
 * Gate a route behind a storefront token.
 *
 * The mirror of requireAdmin, and it matters in the same direction:
 * an admin token must not pass here either. "Any valid token" is not
 * a permission — a route that reads `req.user.id` as a customer id
 * would otherwise happily treat an admin's id as one and go looking
 * for a customer row that does not exist.
 */
export const requireCustomer = (req, res, next) => {
  const user = req.user;

  if (!user) {
    throw ApiError.unauthorized("Authentication required", "UNAUTHORIZED");
  }

  if (user.typ !== CUSTOMER_TOKEN_TYPE) {
    logger.warn("Non-customer token presented to a storefront route", {
      userId: user.id,
      typ: user.typ,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
    });

    throw ApiError.forbidden(
      "You do not have permission to perform this action",
      "CUSTOMER_REQUIRED",
    );
  }

  next();
};

// ============================================================
// REQUIRE OWNERSHIP
// ============================================================

/**
 * requireSelf("id") — the caller may only act on their own record.
 *
 * Authentication proves who someone is; this proves the row they are
 * reaching for is theirs. Without it every `/:id` route under a
 * customer token is a route for editing *any* customer, which is a
 * worse hole than leaving it unauthenticated, because it looks
 * protected.
 *
 * Deliberately 404, not 403: telling someone "that account exists but
 * is not yours" confirms an account exists. To a caller who is not the
 * owner, somebody else's record should simply not be there.
 */
export const requireSelf =
  (param = "id") =>
  (req, res, next) => {
    const user = req.user;

    if (!user) {
      throw ApiError.unauthorized("Authentication required", "UNAUTHORIZED");
    }

    if (String(req.params?.[param]) !== String(user.id)) {
      logger.warn("Ownership check failed", {
        userId: user.id,
        requested: req.params?.[param],
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });

      throw ApiError.notFound("Customer not found");
    }

    next();
  };

// ============================================================
// REQUIRE SPECIFIC ROLE
// ============================================================

/**
 * requireRole("super_admin") — narrower than requireAdmin, for
 * routes only some admins may reach.
 *
 * Usage: router.delete("/x", authenticate, requireAdmin, requireRole(ADMIN_ROLES.SUPER_ADMIN), handler)
 */
export const requireRole = (...allowedRoles) => {
  const allowed = allowedRoles.flat();

  return (req, res, next) => {
    const user = req.user;

    if (!user) {
      throw ApiError.unauthorized("Authentication required", "UNAUTHORIZED");
    }

    if (!allowed.includes(user.role)) {
      logger.warn("Role check failed", {
        userId: user.id,
        role: user.role,
        allowed,
        method: req.method,
        path: req.originalUrl,
      });

      throw ApiError.forbidden(
        "You do not have permission to perform this action",
        "INSUFFICIENT_ROLE",
      );
    }

    next();
  };
};
