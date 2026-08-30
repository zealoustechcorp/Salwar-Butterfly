/**
 * Storefront auth calls against the Express API (F-01.02).
 *
 * The mirror of lib/admin/auth.js: the provider owns the token, this
 * file owns the endpoints. Both return `{ ok, ... }` rather than
 * throwing for a wrong password, because "invalid credentials" is an
 * expected outcome of a sign-in form, not an exception.
 *
 * Every call names its token explicitly — `null` for the public ones.
 * That is not decoration. The shared client falls back to the *admin*
 * token when none is given, so a storefront call that stayed silent
 * would send an admin's credentials from a browser that happens to
 * have both sessions open.
 */

import { api, ApiError } from "@/lib/api/client";

/** The shape the rest of the storefront passes around. */
function toCustomer(dto) {
  if (!dto) return null;

  return {
    id: String(dto.id),
    name: dto.name ?? "",
    email: dto.email ?? "",
    phone: dto.phone ?? "",
  };
}

/**
 * Turns a thrown ApiError into the `{ ok: false }` shape, putting the
 * message under the field that caused it where the API named one.
 */
function toFailure(error, fallbackField) {
  if (!(error instanceof ApiError)) throw error;

  const named = Object.keys(error.fields ?? {})[0];

  return {
    ok: false,
    code: error.code,
    field: named ?? fallbackField,
    error: named ? error.fields[named] : error.message,
    fields: error.fields ?? {},
  };
}

// ============================================================
// SIGN IN
// ============================================================

/**
 * @returns {Promise<{ok: true, user, token} | {ok: false, code, field, error}>}
 */
export async function signIn({ email, password }) {
  try {
    const data = await api.post(
      "/customers/auth/login",
      { email, password },
      { token: null },
    );

    return { ok: true, user: toCustomer(data.customer), token: data.token };
  } catch (error) {
    // The API answers one message for a wrong password and an unknown
    // address alike, so it cannot say which field is at fault. Password
    // is the kinder guess: it is the one a returning shopper mistypes.
    return toFailure(error, "password");
  }
}

// ============================================================
// REGISTER
// ============================================================

/**
 * Creates the account, then signs into it.
 *
 * Two calls because registration does not issue a token — it is a
 * public endpoint that creates a row, and handing back a session from
 * it would mean the sign-up path and the sign-in path could drift.
 * The second call is the same one the sign-in form makes.
 *
 * If the sign-in half fails after the account was created, that is
 * reported as a sign-in problem rather than a sign-up one: the account
 * exists, and telling them registration failed would send them round
 * to try the same email again and hit "already registered".
 */
export async function register({ name, email, phone, password }) {
  try {
    await api.post(
      "/customers/register",
      { name, email, phone, password },
      { token: null },
    );
  } catch (error) {
    return toFailure(error, "email");
  }

  const result = await signIn({ email, password });

  if (!result.ok) {
    return {
      ...result,
      error:
        "Your account was created, but signing in failed. Try signing in.",
    };
  }

  return result;
}

// ============================================================
// CURRENT CUSTOMER
// ============================================================

/**
 * Exchange a stored token for the customer it belongs to.
 *
 * Throws rather than returning `{ ok }` — the caller is the provider
 * on boot, not a form, and it needs to tell "this token is no good"
 * (drop it) from "the API is unreachable" (keep it, try later).
 */
export async function fetchCurrentCustomer(token, signal) {
  if (!token) return null;

  const data = await api.get("/customers/auth/me", { token, signal });

  return toCustomer(data?.customer);
}

// ============================================================
// SIGN OUT
// ============================================================

/**
 * Best-effort. The token is stateless, so discarding it client-side is
 * what actually ends the session; this call only lets the server log
 * the event.
 */
export async function signOut(token) {
  if (!token) return;

  try {
    // `undefined`, not `null` — express.json() runs in strict mode and
    // rejects a bare `null` body with a 400.
    await api.post("/customers/auth/logout", undefined, { token });
  } catch {
    /* signing out must never fail in the UI */
  }
}

// ============================================================
// PROFILE  (F-05.02 / F-05.06)
// ============================================================

/**
 * Updates the shopper's own details.
 *
 * `/customers/auth/me`, not the admin screen's
 * `/customers/updateCustomer/:id`. There is no id in the path because
 * the row edited is whichever one the token names — a shopper cannot
 * aim this at somebody else's account even by trying.
 *
 * Send only what changed; email and phone are unique across live
 * accounts, so a clash comes back with the field named.
 */
export async function updateProfile(fields, token) {
  try {
    const data = await api.put("/customers/auth/me", fields, { token });

    return { ok: true, user: toCustomer(data.customer) };
  } catch (error) {
    return toFailure(error, "name");
  }
}

/**
 * Changes the shopper's own password (F-05.06).
 *
 * The route checks three things: that the token is genuine, that it is
 * a customer's and not an admin's, and that the id in the URL is the
 * caller's own. The current password is still required on top.
 */
export async function changePassword(id, { oldPassword, newPassword }, token) {
  try {
    await api.post(
      `/customers/${encodeURIComponent(id)}/change-password`,
      { oldPassword, newPassword },
      { token },
    );

    return { ok: true };
  } catch (error) {
    return toFailure(error, "oldPassword");
  }
}
