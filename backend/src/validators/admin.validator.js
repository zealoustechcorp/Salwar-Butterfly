// src/validators/admin.validator.js

import { ApiError } from "../utils/ApiError.js";

import {
  validateAdminEmail,
  validateAdminLoginPassword,
  validateAdminPassword,
} from "./admin.rules.js";

// ============================================================
// ADMIN LOGIN
// ============================================================

export const validateAdminLogin = (req, res, next) => {
  const { email, password } = req.body ?? {};

  const errors = {};

  // ----------------------------------------------------------
  // EMAIL
  // ----------------------------------------------------------

  const emailError = validateAdminEmail(email, true);

  if (emailError) {
    errors.email = emailError;
  }

  // ----------------------------------------------------------
  // PASSWORD
  // ----------------------------------------------------------

  const passwordError = validateAdminLoginPassword(password);

  if (passwordError) {
    errors.password = passwordError;
  }

  // ----------------------------------------------------------
  // VALIDATION FAILED
  // ----------------------------------------------------------
  //
  // Note the object form. `new ApiError(400, "...", errors)` —
  // the positional style used elsewhere in this codebase — makes
  // the constructor destructure a number, so every field falls
  // back to its default and the client receives a 500.
  //
  // ----------------------------------------------------------

  if (Object.keys(errors).length > 0) {
    throw ApiError.badRequest("Validation failed", "VALIDATION_ERROR", null, errors);
  }

  // ----------------------------------------------------------
  // NORMALIZE INPUT
  // ----------------------------------------------------------

  req.body.email = email.trim().toLowerCase();

  next();
};

// ============================================================
// FORGOT PASSWORD
// ============================================================

export const validateAdminForgotPassword = (req, res, next) => {
  const { email } = req.body ?? {};

  const emailError = validateAdminEmail(email, true);

  if (emailError) {
    throw ApiError.badRequest("Validation failed", "VALIDATION_ERROR", null, {
      email: emailError,
    });
  }

  // Lower-cased: the lookup is an exact match on the stored address.
  req.body.email = email.trim().toLowerCase();

  next();
};

// ============================================================
// RESET PASSWORD
// ============================================================
//
// The new password meets the same rules `npm run admin:create` applies
// — a reset is not a way round them.
//
// ============================================================

export const validateAdminResetPassword = (req, res, next) => {
  const { token, password } = req.body ?? {};

  const errors = {};

  // The token is 43 base64url characters; anything far from that is not
  // one of ours and is refused before it costs a bcrypt hash.
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,200}$/.test(token)) {
    errors.token = "This reset link is not valid. Please ask for a new one.";
  }

  const passwordError = validateAdminPassword(password, true);

  if (passwordError) {
    errors.password = passwordError;
  }

  if (Object.keys(errors).length > 0) {
    throw ApiError.badRequest("Validation failed", "VALIDATION_ERROR", null, errors);
  }

  next();
};
