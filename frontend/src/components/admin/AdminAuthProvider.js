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
 * truth, and a resolution is tagged with the token it was fetched with.
 *
 * One token change is not a change of identity, though: renewal. An
 * access token lives fifteen minutes and the api client swaps it off
 * the refresh cookie whenever one lapses, so a panel left open renews
 * several times an hour. Treating each new token as unresolved used to
 * drop status back to "loading" for the length of a /me round trip —
 * and RequireAdmin answers "loading" by replacing AdminShell (and the
 * ToastProvider inside it) with a spinner, which unmounted the page and
 * threw away unsaved edits, staged uploads and toasts every quarter of
 * an hour. So an identity resolved for one token is *carried* onto the
 * next while that one is re-checked in the background; "loading" is
 * only for the first resolution after a page load or a sign-in. A real
 * sign-out still clears it: the token goes to null on the way (see the
 * transition check below), and an expiry drops it explicitly.
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
  endSession,
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
  /**
   * `{ token, ready }`.
   *
   * `ready` exists because the access token lives in memory now, so a
   * page load genuinely starts without one and has to ask the API
   * whether this browser still holds a session. Until that answer is
   * back, "no token" does not yet mean "signed out" — and treating it
   * as such would bounce a signed-in admin to the login screen on
   * every refresh.
   */
  const { token, ready } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

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

  /**
   * The token the previous render saw. Only used to spot the session
   * passing through "no token" — a sign-out here or in another tab —
   * which is what separates a sign-out-then-sign-in (a possibly
   * different admin, so the old identity must not be carried) from a
   * renewal (token A straight to token B, same session).
   *
   * Adjusted during render rather than in an effect, React's pattern
   * for state derived from a changing input. signIn records its
   * identity while the token is still null, which is not a non-null →
   * null transition, so it survives this.
   */
  const [seenToken, setSeenToken] = useState(token);

  if (seenToken !== token) {
    setSeenToken(token);
    if (seenToken && !token) setResolved(null);
  }

  // A resolution fetched with the token we currently hold.
  const isFresh = resolved !== null && resolved.token === token;

  // An identity resolved for an earlier token of this same session —
  // the token was renewed and /me has not answered for the new one yet.
  const isCarried =
    !isFresh && Boolean(token) && Boolean(resolved?.admin) && seenToken === token;

  const admin = isFresh || isCarried ? resolved.admin : null;
  const outage = isFresh ? resolved.outage : null;

  const status = !ready
    ? // The session is still being restored from the refresh cookie.
      STATUS.LOADING
    : !token
      ? STATUS.ANONYMOUS
      : isFresh
        ? admin
          ? STATUS.AUTHENTICATED
          : STATUS.ANONYMOUS
        : isCarried
          ? STATUS.AUTHENTICATED
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
        // be valid once the backend is back — and say so. Unless this
        // was only the background re-check after a renewal: the refresh
        // endpoint just vouched for the session, so keep the identity
        // (and the mounted panel) rather than blanking it for a blip.
        if (error instanceof ApiError && error.code === NETWORK_ERROR) {
          setResolved((prev) =>
            prev?.admin
              ? { token, admin: prev.admin, outage: null }
              : { token, admin: null, outage: error.message },
          );
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
    setResolved(null);

    // Leaving on purpose is not something to explain on the way back.
    setExpiry(null);

    // Clears the token locally, then tells the server to revoke the
    // session family behind the refresh cookie. The local half does not
    // wait on the network; the server half is what makes this a logout
    // the session cannot survive.
    await endSession();
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
