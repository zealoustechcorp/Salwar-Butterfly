// src/validators/customer.validator.js

import { ApiError } from "../utils/ApiError.js";

import {
  validateName,
  validateEmail,
  validatePhone,
  validatePassword,
} from "./customer.rules.js";

// ============================================================
// CREATE CUSTOMER
// ============================================================

export const validateCreateCustomer = (req, res, next) => {
  const { name, email, phone, password } = req.body;

  const errors = {};

  // ----------------------------------------------------------
  // NAME
  // ----------------------------------------------------------

  const nameError = validateName(name, true);

  if (nameError) {
    errors.name = nameError;
  }

  // ----------------------------------------------------------
  // EMAIL
  // ----------------------------------------------------------

  const emailError = validateEmail(email, true);

  if (emailError) {
    errors.email = emailError;
  }

  // ----------------------------------------------------------
  // PHONE
  // ----------------------------------------------------------

  const phoneError = validatePhone(phone, true);

  if (phoneError) {
    errors.phone = phoneError;
  }

  // ----------------------------------------------------------
  // PASSWORD
  // ----------------------------------------------------------

  const passwordError = validatePassword(password, true);

  if (passwordError) {
    errors.password = passwordError;
  }

  // ----------------------------------------------------------
  // VALIDATION FAILED
  // ----------------------------------------------------------

  if (Object.keys(errors).length > 0) {
    throw new ApiError(400, "Validation failed", errors);
  }

  // ----------------------------------------------------------
  // NORMALIZE INPUT
  // ----------------------------------------------------------

  req.body.name = name.trim();

  req.body.email = email.trim().toLowerCase();

  req.body.phone = phone.trim();

  next();
};

// ============================================================
// UPDATE CUSTOMER
// ============================================================

export const validateUpdateCustomer = (req, res, next) => {
  const { name, email, phone } = req.body;

  const errors = {};

  // ----------------------------------------------------------
  // AT LEAST ONE FIELD
  // ----------------------------------------------------------

  if (name === undefined && email === undefined && phone === undefined) {
    throw new ApiError(400, "At least one field is required to update");
  }

  // ----------------------------------------------------------
  // NAME
  // ----------------------------------------------------------

  if (name !== undefined) {
    const nameError = validateName(name, false);

    if (nameError) {
      errors.name = nameError;
    }
  }

  // ----------------------------------------------------------
  // EMAIL
  // ----------------------------------------------------------

  if (email !== undefined) {
    const emailError = validateEmail(email, false);

    if (emailError) {
      errors.email = emailError;
    }
  }

  // ----------------------------------------------------------
  // PHONE
  // ----------------------------------------------------------

  if (phone !== undefined) {
    const phoneError = validatePhone(phone, false);

    if (phoneError) {
      errors.phone = phoneError;
    }
  }

  // ----------------------------------------------------------
  // VALIDATION FAILED
  // ----------------------------------------------------------

  if (Object.keys(errors).length > 0) {
    throw new ApiError(400, "Validation failed", errors);
  }

  // ----------------------------------------------------------
  // NORMALIZE VALUES
  // ----------------------------------------------------------

  if (name !== undefined) {
    req.body.name = name.trim();
  }

  if (email !== undefined) {
    req.body.email = email.trim().toLowerCase();
  }

  if (phone !== undefined) {
    req.body.phone = phone.trim();
  }

  next();
};

// ============================================================
// CHANGE PASSWORD
// ============================================================

export const validateChangePassword = (req, res, next) => {
  const { oldPassword, newPassword } = req.body;

  const errors = {};

  // ----------------------------------------------------------
  // CURRENT PASSWORD
  // ----------------------------------------------------------

  const oldPasswordError = validatePassword(oldPassword, true);

  if (oldPasswordError) {
    errors.oldPassword = "Current password is required";
  }

  // ----------------------------------------------------------
  // NEW PASSWORD
  // ----------------------------------------------------------

  const newPasswordError = validatePassword(newPassword, true);

  if (newPasswordError) {
    errors.newPassword = newPasswordError;
  }

  // ----------------------------------------------------------
  // SAME PASSWORD CHECK
  // ----------------------------------------------------------

  if (
    typeof oldPassword === "string" &&
    typeof newPassword === "string" &&
    oldPassword === newPassword
  ) {
    errors.newPassword = "New password must be different from current password";
  }

  // ----------------------------------------------------------
  // VALIDATION FAILED
  // ----------------------------------------------------------

  if (Object.keys(errors).length > 0) {
    throw new ApiError(400, "Validation failed", errors);
  }

  next();
};
