// src/utils/jwt.js

import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const JWT_ALGORITHM = "HS256";

/**
 * Generate an access token.
 *
 * Only include non-sensitive identity/authorization data
 * in the payload.
 */
export const generateToken = (payload) => {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("JWT payload must be an object");
  }

  if (!env.jwtSecret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(payload, env.jwtSecret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: env.jwtExpiresIn,
  });
};

/**
 * Verify an access token.
 *
 * jwt.verify() throws when the token is:
 * - expired
 * - malformed
 * - invalid
 * - signed with an unexpected secret
 * - signed using an unexpected algorithm
 */
export const verifyToken = (token) => {
  if (!token || typeof token !== "string") {
    throw new Error("JWT token is required");
  }

  if (!env.jwtSecret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.verify(token, env.jwtSecret, {
    algorithms: [JWT_ALGORITHM],
  });
};
