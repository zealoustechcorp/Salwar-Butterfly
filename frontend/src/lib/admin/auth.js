/**
 * Admin auth calls against the Express API.
 *
 * Thin on purpose: the provider owns the token, this file owns the
 * endpoints. Mirrors the { ok, ... } result convention used by the
 * storefront's AuthModal rather than throwing for a wrong password,
 * because "invalid credentials" is an expected outcome of a login
 * form, not an exception.
 */

import { api, ApiError } from "@/lib/api/client";

// ============================================================
// LOGIN
// ============================================================

/**
 * @returns {Promise<{ok: true, admin, token, expiresIn}
 *                 | {ok: false, code, error, fields}>}
 */
export async function login(email, password) {
  try {
    // `token: null` — logging in is how you get a token, so this call
    // must not carry the expired one that sent the admin back here.
    const data = await api.post(
      "/admin/auth/login",
      { email, password },
      { token: null },
    );

    return {
      ok: true,
      admin: data.admin,
      token: data.token,
      expiresIn: data.expiresIn,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        ok: false,
        code: error.code,
        error: error.message,
        fields: error.fields ?? {},
      };
    }

    throw error;
  }
}

// ============================================================
// CURRENT ADMIN
// ============================================================

/**
 * Exchange a stored token for the admin it belongs to.
 *
 * Returns null when the token is absent, expired, or belongs to an
 * account that has since been deactivated — all of which mean the
 * same thing to the UI: sign in again.
 */
export async function fetchCurrentAdmin(token, signal) {
  if (!token) return null;

  const data = await api.get("/admin/auth/me", { token, signal });

  return data?.admin ?? null;
}

// ============================================================
// LOGOUT
// ============================================================

/**
 * Best-effort. The token is stateless, so discarding it client-side
 * is what actually ends the session; this call only lets the server
 * log the event.
 */
export async function logout(token) {
  if (!token) return;

  try {
    // `undefined`, not `null` — express.json() runs in strict mode and
    // rejects a bare `null` body with a 400.
    await api.post("/admin/auth/logout", undefined, { token });
  } catch {
    /* signing out must never fail in the UI */
  }
}
