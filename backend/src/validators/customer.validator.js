// src/validators/customer.validator.js

import { ApiError } from "../utils/ApiError.js";

import {
  CUSTOMER_SORTS,
  MAX_PAGE_SIZE,
  MAX_SEARCH_LENGTH,
} from "../config/customer.query.js";

import {
  validateName,
  validateEmail,
  validatePhone,
  validatePassword,
} from "./customer.rules.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ============================================================
// CUSTOMER ID PARAM
// ============================================================

/**
 * Rejects a malformed id before it reaches Postgres.
 *
 * Without this a non-UUID reaches the driver and comes back as a 22P02,
 * which the repository translates into a 500 — an invalid id in the URL
 * is the caller's mistake and should read as one.
 */
export const validateCustomerIdParam = (req, res, next) => {
  const id = req.params?.id;

  if (!UUID_REGEX.test(String(id ?? "").trim())) {
    throw new ApiError(400, "Invalid customer ID format");
  }

  req.params.id = String(id).trim();

  next();
};

// ============================================================
// CUSTOMER LIST QUERY
// ============================================================

/**
 * Shape checks for the admin list (F-05.04).
 *
 * The clamping itself happens in CustomerService, so a caller that
 * asks for page 0 is corrected rather than refused. What is refused is
 * a request that cannot be honestly answered — a limit above the cap
 * would be silently reduced, and a screen that asked for 500 rows and
 * received 100 without being told has no way to know it is showing a
 * partial list.
 */
export const validateCustomerQuery = (req, res, next) => {
  const { page, limit, search, sort } = req.query ?? {};

  const errors = {};

  if (
    page !== undefined &&
    (!Number.isInteger(Number(page)) || Number(page) < 1)
  ) {
    errors.page = "Page must be a positive whole number";
  }

  if (limit !== undefined) {
    if (!Number.isInteger(Number(limit)) || Number(limit) < 1) {
      errors.limit = "Limit must be a positive whole number";
    } else if (Number(limit) > MAX_PAGE_SIZE) {
      errors.limit = `Limit must not exceed ${MAX_PAGE_SIZE}`;
    }
  }

  if (search !== undefined) {
    if (typeof search !== "string") {
      errors.search = "Search must be a string";
    } else if (search.length > MAX_SEARCH_LENGTH) {
      errors.search = `Search must not exceed ${MAX_SEARCH_LENGTH} characters`;
    }
  }

  if (sort !== undefined && !CUSTOMER_SORTS.includes(sort)) {
    errors.sort = `Unknown sort. Expected one of: ${CUSTOMER_SORTS.join(", ")}.`;
  }

  if (Object.keys(errors).length > 0) {
    throw new ApiError(400, "Validation failed", errors);
  }

  next();
};

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
// CUSTOMER LOGIN
// ============================================================

/**
 * Shape check only (F-01.02).
 *
 * Note what is NOT checked: the password's length or format. The
 * rules that apply when *choosing* a password must not apply when
 * presenting one — rejecting a 6-character attempt with "must be at
 * least 8 characters" tells an attacker their guess was too short to
 * be this account's password, which is a free filter on the search
 * space. A missing password is the only failure worth naming.
 */
export const validateCustomerLogin = (req, res, next) => {
  const { email, password } = req.body ?? {};

  const errors = {};

  const emailError = validateEmail(email, true);

  if (emailError) {
    errors.email = emailError;
  }

  if (typeof password !== "string" || password.length === 0) {
    errors.password = "Password is required";
  }

  if (Object.keys(errors).length > 0) {
    throw new ApiError(400, "Validation failed", errors);
  }

  req.body.email = email.trim().toLowerCase();

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
