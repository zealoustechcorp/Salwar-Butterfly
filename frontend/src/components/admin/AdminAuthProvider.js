"use client";

/**
 * Admin session context for everything under /admin.
 *
 * The token lives in a module store (lib/admin/session.js) rather
 * than in state, so a sign-out in one tab propagates to the others.
 * The *identity* is fetched from the API instead of being decoded
 * out of the JWT: a token is only proof it was issued, not proof the
 * account is still active, and the panel should not render for an
 * admin who was deactivated an hour ago.
 *
 * Status is derived, never stored. The token is the single source of
 * truth, and a resolution is only meaningful for the token it was
 * fetched with — pairing them means a token change cannot leave a
 * stale identity behind, and there is no state to synchronise in an
 * effect.
 *
 * Expiry is not this provider's job to detect. The api client ends the
 * session the moment any call comes back with an expired token
 * (lib/api/expiry.js), which clears the store and lands here as an
 * ordinary token change — status goes anonymous and RequireAdmin does
 * the redirecting. All this listens for is the *reason*, so the login
 * page can say why rather than appearing for no visible cause.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  writeToken,
  clearToken,
} from "@/lib/admin/session";

import * as adminAuth from "@/lib/admin/auth";
import { ApiError, NETWORK_ERROR } from "@/lib/api/client";
import { expiryMessage, subscribeToExpiry } from "@/lib/api/expiry";

const AdminAuthContext = createContext(null);

/** "loading" → we do not yet know; "authenticated" / "anonymous" → we do. */
const STATUS = Object.freeze({
  LOADING: "loading",
  AUTHENTICATED: "authenticated",
  ANONYMOUS: "anonymous",
});

export function AdminAuthProvider({ children }) {
  const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /**
   * `{ token, admin, outage }` — the identity we resolved, tagged
   * with the token it belongs to. Null until the first resolution.
   *
   * `outage` is set when /me fails for a reason that is not "bad
   * token" (a stopped backend, say), so the UI can explain itself
   * instead of bouncing to a login page that will also fail.
   */
  const [resolved, setResolved] = useState(null);

  /**
   * Why the session ended, when it ended by itself. Held here rather
   * than in the login page because the page mounts *after* the
   * redirect that the expiry caused — this provider wraps both, so it
   * is the nearest thing that survives the trip.
   */
  const [expiry, setExpiry] = useState(null);

  // A resolution only counts if it was fetched with the token we
  // currently hold. Anything else is stale by definition.
  const isResolved = resolved !== null && resolved.token === token;

  const admin = isResolved ? resolved.admin : null;
  const outage = isResolved ? resolved.outage : null;

  const status = !token
    ? STATUS.ANONYMOUS
    : isResolved
      ? admin
        ? STATUS.AUTHENTICATED
        : STATUS.ANONYMOUS
      : STATUS.LOADING;

  // --------------------------------------------------------
  // RESOLVE THE TOKEN INTO AN IDENTITY
  // --------------------------------------------------------

  useEffect(() => {
    // No token, or this token is already resolved (including the
    // identity signIn just supplied) — nothing to fetch.
    if (!token || resolved?.token === token) return;

    const controller = new AbortController();
    let active = true;

    adminAuth
      .fetchCurrentAdmin(token, controller.signal)
      .then((next) => {
        if (active) setResolved({ token, admin: next, outage: null });
      })
      .catch((error) => {
        if (!active || error?.name === "AbortError") return;

        // The API is unreachable. Keep the token — it may well still
        // be valid once the backend is back — and say so.
        if (error instanceof ApiError && error.code === NETWORK_ERROR) {
          setResolved({ token, admin: null, outage: error.message });
          return;
        }

        // 401/403: the token is genuinely no good. Drop it so we do
        // not retry with it on every navigation.
        clearToken();
        setResolved({ token, admin: null, outage: null });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [token, resolved]);

  // --------------------------------------------------------
  // THE SESSION ENDING ON ITS OWN
  // --------------------------------------------------------
  //
  // The api client has already cleared the token by the time this
  // runs; the store change is what actually signs the panel out. This
  // only keeps the reason, and drops the identity that went with the
  // dead token so nothing renders against it.

  useEffect(
    () =>
      subscribeToExpiry(({ scope, code }) => {
        if (scope !== "admin") return;

        setResolved(null);
        setExpiry(expiryMessage(code));
      }),
    [],
  );

  // --------------------------------------------------------
  // ACTIONS
  // --------------------------------------------------------

  const signIn = useCallback(async (email, password) => {
    const result = await adminAuth.login(email, password);

    if (!result.ok) return result;

    // Record the identity against the incoming token *before*
    // storing it, so the token change lands already resolved and the
    // panel never passes through a loading state on sign-in.
    setResolved({ token: result.token, admin: result.admin, outage: null });
    setExpiry(null);

    writeToken(result.token);

    return result;
  }, []);

  const signOut = useCallback(async () => {
    const current = getSnapshot();

    // Clear locally first — sign-out must not depend on the network.
    clearToken();
    setResolved(null);

    // Leaving on purpose is not something to explain on the way back.
    setExpiry(null);

    await adminAuth.logout(current);
  }, []);

  const value = {
    admin,
    status,
    outage,
    expiry,
    isLoading: status === STATUS.LOADING,
    isSignedIn: status === STATUS.AUTHENTICATED,
    signIn,
    signOut,
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);

  if (!context) {
    throw new Error("useAdminAuth must be used inside <AdminAuthProvider>");
  }

  return context;
}

export { STATUS as ADMIN_AUTH_STATUS };
