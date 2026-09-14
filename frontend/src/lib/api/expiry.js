/**
 * What happens when the API stops accepting a token.
 *
 * A JWT expires on a clock, not on an action, so the moment it lapses
 * is almost never the moment anybody looked at it. Both providers
 * already handle the one predictable case — the `/me` call they make
 * on boot — but a session that runs out *while* the panel is open used
 * to survive: the request failed, the screen showed an error, and the
 * stale token sat in localStorage failing every call after it.
 *
 * So the client hands the dead token here instead, and this module
 * signs the browser out of whichever session it belonged to:
 *
 *   admin      lib/admin/session.js   → RequireAdmin sends them to
 *                                       /admin/login
 *   customer   lib/store/session.js   → the header drops back to
 *                                       signed-out
 *
 * Matching on the token itself rather than on the URL is what keeps
 * the two apart in a browser that has both open: only the session that
 * actually issued the rejected credential is ended, and a token we do
 * not store (one a caller passed in by hand) ends nothing.
 *
 * The subscription is for the *announcement*, not the sign-out — that
 * has already happened by the time a listener runs. It is how the
 * providers get to say why the shopper is suddenly signed out instead
 * of letting it happen silently mid-checkout.
 */

import {
  clearToken as clearAdminToken,
  readToken as readAdminToken,
} from "@/lib/admin/session";

import {
  clearSession as clearCustomerSession,
  readToken as readCustomerToken,
} from "@/lib/store/session";

// ============================================================
// CODES
// ============================================================

/**
 * The 401 codes that mean "this credential is finished" rather than
 * "you are not allowed to do that".
 *
 * TOKEN_MISSING is deliberately absent: it means no token was sent, so
 * there is nothing to sign out of.
 *
 * TOKEN_TYPE_INVALID means a refresh token was sent where an access
 * token belongs. A client that has managed that is confused about what
 * it is holding, and the honest response is to stop holding it.
 *
 * Note that reaching here at all now means a renewal was tried first
 * and failed — the api client renews before it gives up, so by the time
 * this module runs the session really is over.
 */
const ENDED_CODES = new Set([
  "TOKEN_EXPIRED",
  "TOKEN_INVALID",
  "TOKEN_TYPE_INVALID",
]);

export function isSessionEnded(status, code) {
  return status === 401 && ENDED_CODES.has(code);
}

/** Wording for the sign-in prompt that follows. */
export function expiryMessage(code) {
  return code === "TOKEN_EXPIRED"
    ? "Your session expired. Please sign in again."
    : "Your session is no longer valid. Please sign in again.";
}

// ============================================================
// SUBSCRIPTION
// ============================================================

const listeners = new Set();

/**
 * @param {(event: {scope: "admin"|"customer", token: string, code: string}) => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribeToExpiry(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ============================================================
// SIGN OUT
// ============================================================

/**
 * Ends the session `bearer` belongs to, if it is one we hold.
 *
 * @returns {"admin"|"customer"|null} whose session was ended
 */
export function expireSession(bearer, code) {
  // No storage on the server, and nothing to end without a token.
  if (typeof window === "undefined" || !bearer) return null;

  let scope = null;

  if (bearer === readAdminToken()) {
    clearAdminToken();
    scope = "admin";
  } else if (bearer === readCustomerToken()) {
    clearCustomerSession();
    scope = "customer";
  } else {
    return null;
  }

  // Copied, so a listener that unsubscribes itself does not mutate the
  // set mid-iteration.
  for (const listener of [...listeners]) {
    listener({ scope, token: bearer, code });
  }

  return scope;
}
