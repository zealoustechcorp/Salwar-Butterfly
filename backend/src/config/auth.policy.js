// src/config/auth.policy.js
//
// The rules the session is made of — how long each half of a session
// lives, how the refresh token is carried, and how it is stored.
//
// A policy module rather than constants scattered across the two auth
// services, for the reason the others exist: the repository computes an
// expiry, the service signs a token to match it, and the controller
// sets a cookie that has to outlive both. Three files agreeing about
// one number is exactly the thing that drifts.
//
// The shape of the session:
//
//   access token   15 minutes, returned in the response body, held in
//                  the browser's memory and sent as a Bearer header.
//                  Short because nothing can revoke it — it is a plain
//                  signed assertion, and the only thing that stops a
//                  stolen one is its own expiry.
//
//   refresh token  30 days, set as an httpOnly cookie and never
//                  readable by page JavaScript. Backed by a row in
//                  `refresh_tokens`, which is what makes a session
//                  revocable at all: deleting the row ends the session
//                  within one access-token lifetime.
//
// The asymmetry is the whole design. The credential that JavaScript can
// reach is worth fifteen minutes; the credential worth thirty days is
// one JavaScript cannot reach.

import { createHash, randomUUID } from "node:crypto";

import { env } from "./env.js";

// ============================================================
// TOKEN TYPES
// ============================================================

/**
 * The `tok` claim, which says which half of the session a token is.
 *
 * Both halves are signed with the same secret, so without this claim a
 * refresh token would verify perfectly as a bearer token and hand its
 * holder thirty days of access instead of fifteen minutes. `authenticate`
 * accepts ACCESS and nothing else; the refresh endpoint accepts REFRESH
 * and nothing else.
 *
 * The same idea as the existing `typ` claim one level down: `typ` says
 * which audience a token is for, `tok` says what it is allowed to do.
 */
export const TOKEN_USE = Object.freeze({
  ACCESS: "access",
  REFRESH: "refresh",
});

// ============================================================
// AUDIENCES
// ============================================================

/**
 * The two kinds of session, matching the `typ` claim the tokens already
 * carry and the CHECK constraint on `refresh_tokens.typ`.
 *
 * Each gets its own cookie name and path, because an admin who is also
 * a shopper has both sessions open in one browser, and one cookie name
 * would mean signing in on one side silently signed them out of the
 * other.
 */
export const AUTH_AUDIENCE = Object.freeze({
  ADMIN: "admin",
  CUSTOMER: "customer",
});

// ============================================================
// COOKIE
// ============================================================

/**
 * Where each audience's refresh cookie lives.
 *
 * `path` is deliberately narrow. A cookie scoped to `/api` would ride
 * along on every catalogue read and every checkout call — dozens of
 * requests that have no use for it, each one an opportunity to log it,
 * cache it or leak it in a proxy trace. Scoped to the auth router it is
 * sent to exactly two endpoints: refresh and logout.
 */
const COOKIE = Object.freeze({
  [AUTH_AUDIENCE.ADMIN]: Object.freeze({
    name: "sb_admin_refresh",
    path: "/api/admin/auth",
  }),
  [AUTH_AUDIENCE.CUSTOMER]: Object.freeze({
    name: "sb_customer_refresh",
    path: "/api/customers/auth",
  }),
});

/** @param {string} audience */
export const refreshCookieName = (audience) => COOKIE[audience].name;

/**
 * The options every Set-Cookie for a refresh token carries.
 *
 * `httpOnly` is the point of the exercise — it is what makes an XSS on
 * the admin panel unable to carry the session away.
 *
 * `sameSite: "strict"` is the CSRF answer. The refresh endpoint is the
 * only route in the API authenticated by a cookie rather than a header,
 * so it is the only route a cross-site form could reach with
 * credentials attached. Strict means the browser does not attach the
 * cookie to a cross-site request at all, and the new access token is
 * only ever returned in a response body an attacker's page cannot read.
 *
 * Note for deployment: same-site is about the registrable domain, not
 * the port — localhost:3000 talking to localhost:4000 is same-site, and
 * so is app.example.com talking to api.example.com. Only a genuinely
 * different domain would force `sameSite: "none"`, which would give up
 * this protection and need a CSRF token in its place.
 *
 * `secure` is off outside production because local development is http
 * and a Secure cookie would simply never be stored.
 *
 * @param {string} audience
 * @param {number} [maxAgeMs] omitted for the clearing cookie
 */
export const refreshCookieOptions = (audience, maxAgeMs) => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: "strict",
  path: COOKIE[audience].path,
  ...(maxAgeMs === undefined ? {} : { maxAge: maxAgeMs }),
});

// ============================================================
// STORAGE
// ============================================================

/**
 * What goes in `refresh_tokens.token_hash`.
 *
 * The token itself is never stored, for the same reason a password is
 * not: the table is a backup away from being read by someone who should
 * not have it, and a stolen row should not be a usable credential.
 *
 * SHA-256 rather than bcrypt, deliberately. Password hashing is slow on
 * purpose because a password has perhaps forty bits of entropy and must
 * survive an offline guessing attack. A refresh token is a signed JWT —
 * its entropy is the HMAC signature's, and there is nothing to guess.
 * Slow hashing here would only add latency to every refresh.
 */
export const hashToken = (token) =>
  createHash("sha256").update(token).digest("hex");

/**
 * A new session family.
 *
 * Every rotation stays in the family the login opened, so revoking a
 * session means revoking a family and not chasing individual rows. It
 * is also what reuse detection acts on: one stolen token means the
 * whole chain is compromised, including the rotations the thief has
 * already performed.
 */
export const newFamilyId = () => randomUUID();

// ============================================================
// ROTATION
// ============================================================

/**
 * How long after a refresh token is exchanged it may be presented again
 * without that counting as theft.
 *
 * Rotation's security property is that a rotated-out token is never
 * legitimately presented twice — so a second presentation means two
 * parties hold it, and the family is burned. The trouble is that one
 * party can honestly present it twice: two browser tabs, each holding
 * its own access token in memory, both expire while the user is away,
 * both wake up on the same cookie, and both refresh within milliseconds
 * of each other. Under a strict rule the slower tab's request is
 * indistinguishable from a thief's, and the shopper is signed out for
 * having had two tabs open.
 *
 * Ten seconds separates those two cases in practice. A racing tab is
 * behind by milliseconds; a thief is replaying a token captured
 * earlier, from somewhere else, and is not within ten seconds of the
 * rotation that retired it. Inside the window the presentation is
 * treated as the race it almost certainly is and gets its own new
 * token in the same family — which stays the revocation unit, so a
 * logout still ends every branch at once.
 *
 * Widening this trades detection for tolerance. It should not need to
 * grow: the client serialises its own refreshes, so the only races left
 * are between tabs.
 */
export const REFRESH_REUSE_GRACE_MS = 10_000;

// ============================================================
// REASONS
// ============================================================

/**
 * Why a family was revoked. Stored for the support conversation that
 * follows ("why was I signed out?") and read by nothing else.
 */
export const REVOKE_REASON = Object.freeze({
  LOGOUT: "logout",
  REUSE_DETECTED: "reuse_detected",
  ROTATED_OUT: "rotated_out",
});
