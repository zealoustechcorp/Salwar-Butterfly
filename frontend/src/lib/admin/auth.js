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
 * The response carries only the access token. The refresh token comes
 * back as an httpOnly cookie the browser stores itself and this code
 * never sees — which is the point: what JavaScript cannot read,
 * injected JavaScript cannot steal.
 *
 * @returns {Promise<{ok: true, admin, token}
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
      token: data.accessToken,
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
 * Signing out now happens in lib/admin/session.js — `endSession()`.
 *
 * It moved because the call no longer carries a bearer token. Logout
 * authenticates with the refresh cookie and revokes the session family
 * behind it, which is what turned this from an audit line into an
 * actual logout; the cookie is the session module's business, not this
 * file's.
 */
