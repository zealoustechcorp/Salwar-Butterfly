// src/controllers/customer.auth.controller.js

import { CustomerAuthService } from "../services/customer.auth.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { okResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

export const CustomerAuthController = {
  // ==========================================================
  // POST /api/customers/auth/login
  // ==========================================================

  login: asyncHandler(async (req, res) => {
    try {
      const { email, password } = req.body;

      const result = await CustomerAuthService.login(email, password);

      logger.info("Customer login request completed", {
        customerId: result.customer.id,
        ip: req.ip,
      });

      return okResponse({
        res,
        data: result,
        message: "Signed in successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Customer login controller error", {
        ip: req.ip,
        error: error.message,
        stack: error.stack,
      });

      throw ApiError.internal("Failed to sign in");
    }
  }),

  // ==========================================================
  // GET /api/customers/auth/me
  // ==========================================================
  //
  // The storefront calls this on boot to turn a stored token back
  // into an identity, and to confirm the account behind it still
  // exists — an account closed from the admin panel must not keep
  // rendering a signed-in header until its token expires.
  //
  // ==========================================================

  me: asyncHandler(async (req, res) => {
    try {
      const customer = await CustomerAuthService.getCurrentCustomer(
        req.user.id,
      );

      return okResponse({
        res,
        data: { customer },
        message: "Customer retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Customer me controller error", {
        customerId: req.user?.id,
        ip: req.ip,
        error: error.message,
        stack: error.stack,
      });

      throw ApiError.internal("Failed to load the current customer");
    }
  }),

  // ==========================================================
  // PUT /api/customers/auth/me
  // ==========================================================
  //
  // The shopper editing their own profile (F-05.02 / F-05.06).
  //
  // The id comes from the token, never from the body or the URL —
  // there is no id for a caller to substitute, so there is nothing
  // for an ownership check to get wrong. Everything else, including
  // the email and phone uniqueness rules, is the same service call
  // the admin screen makes.
  //
  // ==========================================================

  updateMe: asyncHandler(async (req, res) => {
    try {
      const { name, email, phone } = req.body;

      const customer = await CustomerAuthService.updateOwnProfile(req.user.id, {
        name,
        email,
        phone,
      });

      logger.info("Customer profile update completed", {
        customerId: req.user.id,
        ip: req.ip,
      });

      return okResponse({
        res,
        data: { customer },
        message: "Your details were updated",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Customer profile update controller error", {
        customerId: req.user?.id,
        ip: req.ip,
        error: error.message,
        stack: error.stack,
      });

      throw ApiError.internal("Failed to update your details");
    }
  }),

  // ==========================================================
  // POST /api/customers/auth/logout
  // ==========================================================
  //
  // JWTs are stateless, so the client discarding its token IS the
  // logout. This endpoint exists so the act is auditable, and so a
  // future token denylist has somewhere to live.
  //
  // ==========================================================

  logout: asyncHandler(async (req, res) => {
    logger.info("Customer signed out", {
      customerId: req.user?.id,
      ip: req.ip,
    });

    return okResponse({
      res,
      data: null,
      message: "Signed out successfully",
    });
  }),
};
