/**
 * The admin's access token, held in this browser.
 *
 * Unlike the storefront's session.js — which fakes accounts entirely
 * on the client — this is a real JWT issued by
 * `POST /api/admin/auth/login`. The server signed it and the server
 * verifies it on every request; nothing here is trusted.
 *
 * Storage is localStorage, which is a deliberate trade-off:
 *
 *   + survives a refresh and works across tabs
 *   + one transport (Authorization: Bearer) for every call
 *   - readable by any script that runs on the page, so an XSS on the
 *     admin panel is a stolen session. An httpOnly cookie would not
 *     have that property.
 *
 * Consequences worth knowing: route protection is client-side only
 * (see RequireAdmin), and the token is never read during SSR.
 *
 * Kept framework-free so both AdminAuthProvider and the api client
 * can reach it without importing a component.
 */

const TOKEN_KEY = "sb.admin.token";

// ============================================================
// STORAGE
// ============================================================

export function readToken() {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(TOKEN_KEY);
    return value || null;
  } catch {
    // Private mode, disabled storage, or a quota error — treat as
    // signed out rather than crashing the panel.
    return null;
  }
}

export function writeToken(token) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* the session simply will not survive a refresh */
  }

  emit();
}

export function clearToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to do — the token is already unreachable */
  }

  emit();
}

// ============================================================
// SUBSCRIPTION
// ============================================================
//
// A module-level store rather than component state, so a sign-out in
// one tab reaches the others. `storage` fires only in *other* tabs,
// which is why writeToken/clearToken also emit locally.
//
// ============================================================

const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener) {
  listeners.add(listener);

  const onStorage = (event) => {
    if (event.key === TOKEN_KEY || event.key === null) listener();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    listeners.delete(listener);

    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

/** For useSyncExternalStore. Null on the server — there is no token there. */
export function getSnapshot() {
  return readToken();
}

export function getServerSnapshot() {
  return null;
}
