/**
 * Renewing an access token.
 *
 * Deliberately the leaf of the dependency graph: it imports neither
 * session module and it does not go through lib/api/client.js. Both
 * session modules call it, and the client calls it on a 401, so
 * anything it imported back would be a cycle — and the client's own
 * 401 handling would recurse into itself the moment a refresh failed
 * with a 401, which is precisely how a refresh fails.
 *
 * So: a bare fetch that returns a token or null, and lets its callers
 * decide what that means.
 *
 * The refresh token is not passed in and never appears here. It rides
 * along as an httpOnly cookie the browser attaches on its own, which is
 * what `credentials: "include"` is for and the whole reason the token is
 * out of JavaScript's reach.
 */

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api"
).replace(/\/+$/, "");

/** Where each audience renews. Mirrors the cookie paths on the API. */
const ENDPOINT = {
  admin: "/admin/auth/refresh",
  customer: "/customers/auth/refresh",
};

/**
 * Exchange the refresh cookie for a new access token.
 *
 * @param {"admin"|"customer"} scope
 * @returns {Promise<string|null>} the new access token, or null if this
 *   browser has no live session — which is the ordinary answer for a
 *   visitor who has never signed in, not an error.
 */
export async function requestAccessToken(scope) {
  if (typeof window === "undefined") return null;

  let response;

  try {
    response = await fetch(`${BASE_URL}${ENDPOINT[scope]}`, {
      method: "POST",
      // Without this the browser sends no cookie and every refresh
      // fails, on a site that looks like it is simply signing people
      // out at random.
      credentials: "include",
    });
  } catch {
    // The API is unreachable. Not the same as "signed out", but there
    // is no token to be had either way, and the caller's next request
    // will fail with a network error that says so properly.
    return null;
  }

  if (!response.ok) return null;

  const payload = await response.json().catch(() => null);

  return payload?.data?.accessToken ?? null;
}

/**
 * End the session on the server.
 *
 * Separate from the api client for the same reason as the above: it is
 * called from the session modules, and it carries a cookie rather than
 * a bearer token.
 *
 * Best-effort by design. Signing out must not depend on the network —
 * the caller has already dropped its own token by the time this runs.
 *
 * @param {"admin"|"customer"} scope
 */
export async function requestLogout(scope) {
  if (typeof window === "undefined") return;

  const path = ENDPOINT[scope].replace("/refresh", "/logout");

  try {
    await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* the local session is already gone; the cookie expires on its own */
  }
}
