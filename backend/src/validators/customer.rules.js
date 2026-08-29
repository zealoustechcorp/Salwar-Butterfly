// src/validators/customer.rules.js

/**
 * Shared customer validation rules.
 *
 * This file contains ONLY validation logic.
 * It does not know anything about Express, req, res or next.
 */

// ============================================================
// NAME
// ============================================================

export const validateName = (name, required = true) => {
  if (name === undefined || name === null) {
    return required ? "Name is required" : null;
  }

  if (typeof name !== "string") {
    return "Name must be a string";
  }

  const value = name.trim();

  if (!value) {
    return required ? "Name is required" : "Name cannot be empty";
  }

  if (value.length < 2) {
    return "Name must be at least 2 characters";
  }

  if (value.length > 255) {
    return "Name must not exceed 255 characters";
  }

  return null;
};

// ============================================================
// EMAIL
// ============================================================

export const validateEmail = (email, required = true) => {
  if (email === undefined || email === null) {
    return required ? "Email is required" : null;
  }

  if (typeof email !== "string") {
    return "Email must be a string";
  }

  const value = email.trim().toLowerCase();

  if (!value) {
    return required ? "Email is required" : "Email cannot be empty";
  }

  if (value.length > 255) {
    return "Email must not exceed 255 characters";
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(value)) {
    return "Invalid email format";
  }

  return null;
};

// ============================================================
// PHONE
// ============================================================

export const validatePhone = (phone, required = true) => {
  if (phone === undefined || phone === null) {
    return required ? "Phone number is required" : null;
  }

  if (typeof phone !== "string") {
    return "Phone number must be a string";
  }

  const value = phone.trim();

  if (!value) {
    return required
      ? "Phone number is required"
      : "Phone number cannot be empty";
  }

  /**
   * Supports:
   *
   * +919876543210
   * 919876543210
   * 9876543210
   *
   * Adjust if your application requires
   * a different international format.
   */
  const phoneRegex = /^\+?[1-9]\d{9,14}$/;

  if (!phoneRegex.test(value)) {
    return "Invalid phone number format";
  }

  return null;
};

// ============================================================
// PASSWORD
// ============================================================

export const validatePassword = (password, required = true) => {
  if (password === undefined || password === null) {
    return required ? "Password is required" : null;
  }

  if (typeof password !== "string") {
    return "Password must be a string";
  }

  if (!password) {
    return required ? "Password is required" : "Password cannot be empty";
  }

  /**
   * bcrypt has a 72-byte password limitation.
   *
   * We keep the application limit at 72 characters.
   */
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }

  if (password.length > 72) {
    return "Password must not exceed 72 characters";
  }

  return null;
};
