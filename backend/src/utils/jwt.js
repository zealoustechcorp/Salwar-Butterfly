// src/utils/jwt.js

import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { TOKEN_USE } from "../config/auth.policy.js";

const JWT_ALGORITHM = "HS256";

/**
 * Generate an access token.
 *
 * Short-lived and unrevocable — once signed, nothing can withdraw it
 * before its `exp`. That is why it is measured in minutes: the expiry is
 * the only control over a stolen one. Anything that needs to be
 * withdrawable belongs to the refresh token, which has a row behind it.
 *
 * Only include non-sensitive identity/authorization data
 * in the payload.
 */
export const generateAccessToken = (payload) => {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("JWT payload must be an object");
  }

  if (!env.jwtSecret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign({ ...payload, tok: TOKEN_USE.ACCESS }, env.jwtSecret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: env.accessTokenTtl,
  });
};

/**
 * Generate a refresh token.
 *
 * Carries `fam` — the session family — so reuse detection can revoke a
 * whole chain from the token alone, and `jti` so that two tokens signed
 * for the same subject in the same second are still different strings
 * (without it they would collide on the UNIQUE hash and the second
 * login would fail).
 *
 * The signature is not what authorises this token. The row in
 * `refresh_tokens` is. The signature only lets an obviously forged or
 * expired one be refused before Postgres is troubled.
 */
export const generateRefreshToken = (payload) => {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("JWT payload must be an object");
  }

  if (!env.jwtSecret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign({ ...payload, tok: TOKEN_USE.REFRESH }, env.jwtSecret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: env.refreshTokenTtl,
  });
};

/**
 * Verify a token of either kind.
 *
 * jwt.verify() throws when the token is:
 * - expired
 * - malformed
 * - invalid
 * - signed with an unexpected secret
 * - signed using an unexpected algorithm
 *
 * It does NOT check which kind of token this is. Both halves of a
 * session are signed with the same secret and both verify here, so the
 * callers check `tok` themselves: `authenticate` refuses anything that
 * is not an access token, and the refresh endpoint refuses anything that
 * is not a refresh token. Skipping that check is how a thirty-day
 * refresh token becomes a thirty-day bearer token.
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

/**
 * When a token we just signed expires, as a Date.
 *
 * The TTLs are duration strings ("15m", "30d") because that is what
 * jsonwebtoken accepts, and `refresh_tokens.expires_at` needs a
 * timestamp. Rather than parsing those strings a second time — a second
 * parser is a second chance to disagree with the first — the signed
 * token is decoded and its own `exp` is used. It is exact by
 * construction.
 *
 * No verification: this is only ever called on a token signed a
 * microsecond earlier by the function above.
 */
export const expiryOf = (token) => {
  const decoded = jwt.decode(token);

  if (!decoded || typeof decoded.exp !== "number") {
    throw new Error("Signed token carries no exp claim");
  }

  return new Date(decoded.exp * 1000);
};
