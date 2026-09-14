// src/utils/sessionCookie.js
//
// Carrying the refresh token between the browser and the API.
//
// It travels as an httpOnly cookie rather than in the response body,
// and that single choice is what the whole session design rests on. A
// token the page can read is a token an injected script can read, and
// a thirty-day credential sitting in localStorage would be strictly
// worse than the twenty-four-hour one it replaced. In a cookie marked
// httpOnly it is unreachable from `document.cookie` and from `fetch`:
// a script running on the admin panel can still *use* the session
// while it runs, but it cannot copy the session out and use it
// tomorrow from somewhere else.
//
// Express writes cookies natively via `res.cookie`. Reading them
// normally means the `cookie-parser` middleware, which this file does
// without — two known cookie names on two routes did not seem worth a
// dependency and an app-wide middleware, and parsing only what is
// asked for keeps a malformed header from becoming everybody's problem.

import {
  refreshCookieName,
  refreshCookieOptions,
} from "../config/auth.policy.js";

/**
 * Read one cookie out of the request.
 *
 * Deliberately narrow: it looks for a single name and ignores
 * everything else in the header, so a cookie somebody else set with a
 * broken encoding cannot break the one we need.
 *
 * @param {import('express').Request} req
 * @param {string} name
 * @returns {string | null}
 */
const readCookie = (req, name) => {
  const header = req.headers?.cookie;

  if (!header || typeof header !== "string") return null;

  for (const part of header.split(";")) {
    const eq = part.indexOf("=");

    // A cookie with no "=" is not a pair. Skip rather than treating the
    // whole header as unusable.
    if (eq === -1) continue;

    if (part.slice(0, eq).trim() !== name) continue;

    const raw = part.slice(eq + 1).trim();

    try {
      return decodeURIComponent(raw) || null;
    } catch {
      // A value with a stray percent sign. It is not a token we issued,
      // so it is not a session.
      return null;
    }
  }

  return null;
};

/**
 * The refresh token this request is carrying, if any.
 *
 * @param {import('express').Request} req
 * @param {string} audience  "admin" | "customer"
 */
export const readRefreshCookie = (req, audience) =>
  readCookie(req, refreshCookieName(audience));

/**
 * Send a refresh token to the browser.
 *
 * `maxAge` is derived from the token's own expiry rather than from the
 * TTL string a second time, so the cookie cannot outlive the row it
 * stands for — a cookie that survives its token is a browser that
 * believes it has a session and discovers otherwise on the next call.
 *
 * @param {import('express').Response} res
 * @param {string} audience
 * @param {string} token
 * @param {Date}   expiresAt
 */
export const setRefreshCookie = (res, audience, token, expiresAt) => {
  const maxAgeMs = Math.max(0, expiresAt.getTime() - Date.now());

  res.cookie(
    refreshCookieName(audience),
    token,
    refreshCookieOptions(audience, maxAgeMs),
  );
};

/**
 * Remove the refresh cookie.
 *
 * The options have to match the ones it was set with — a browser treats
 * a differing path or sameSite as a different cookie and quietly keeps
 * the original, which would leave a signed-out browser still holding a
 * credential. `maxAge` is omitted here; `clearCookie` supplies its own
 * expiry in the past.
 *
 * @param {import('express').Response} res
 * @param {string} audience
 */
export const clearRefreshCookie = (res, audience) => {
  res.clearCookie(refreshCookieName(audience), refreshCookieOptions(audience));
};
