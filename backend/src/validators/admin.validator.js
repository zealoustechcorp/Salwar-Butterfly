// src/validators/admin.validator.js

import { ApiError } from "../utils/ApiError.js";

import {
  validateAdminEmail,
  validateAdminLoginPassword,
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
