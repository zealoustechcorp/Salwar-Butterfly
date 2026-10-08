// src/validators/admin.rules.js

/**
 * Shared admin validation rules.
 *
 * This file contains ONLY validation logic.
 * It does not know anything about Express, req, res or next.
 */

import { ADMIN_ROLES } from "../models/admin.entity.js";

// ============================================================
// NAME
// ============================================================

export const validateAdminName = (name, required = true) => {
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

export const validateAdminEmail = (email, required = true) => {
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
// PASSWORD — LOGIN
// ============================================================

/**
 * Login deliberately checks only presence and the bcrypt ceiling.
 *
 * Applying the strength rules here would reject a legitimate
 * password that predates a policy change, and it would tell an
 * attacker which candidate strings are even worth submitting.
 */
export const validateAdminLoginPassword = (password) => {
  if (password === undefined || password === null) {
    return "Password is required";
  }

  if (typeof password !== "string") {
    return "Password must be a string";
  }

  if (!password) {
    return "Password is required";
  }

  if (password.length > 72) {
    return "Password must not exceed 72 characters";
  }

  return null;
};

// ============================================================
// PASSWORD — PROVISIONING
// ============================================================

/**
 * Applied when an admin account is created. bcrypt silently
 * truncates at 72 bytes, so that is a hard ceiling rather than a
 * style choice.
 */
export const validateAdminPassword = (password, required = true) => {
  if (password === undefined || password === null) {
    return required ? "Password is required" : null;
  }

  if (typeof password !== "string") {
    return "Password must be a string";
  }

  if (!password) {
    return required ? "Password is required" : "Password cannot be empty";
  }

  if (password.length < 10) {
    return "Password must be at least 10 characters";
  }

  if (password.length > 72) {
    return "Password must not exceed 72 characters";
  }

  if (!/[a-z]/.test(password)) {
    return "Password must contain a lowercase letter";
  }

  if (!/[A-Z]/.test(password)) {
    return "Password must contain an uppercase letter";
  }

  if (!/\d/.test(password)) {
    return "Password must contain a number";
  }

  return null;
};

// ============================================================
// ROLE
// ============================================================

export const validateAdminRole = (role, required = false) => {
  if (role === undefined || role === null) {
    return required ? "Role is required" : null;
  }

  if (typeof role !== "string") {
    return "Role must be a string";
  }

  const value = role.trim().toLowerCase();

  if (!value) {
    return required ? "Role is required" : "Role cannot be empty";
  }

  const allowed = Object.values(ADMIN_ROLES);

  if (!allowed.includes(value)) {
    return `Role must be one of: ${allowed.join(", ")}`;
  }

  return null;
};
