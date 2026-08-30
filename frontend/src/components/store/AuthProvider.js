"use client";

/**
 * Who is signed in, and the one modal that asks.
 *
 * The credential work lives in `@/lib/store/auth` and the storage in
 * `@/lib/store/session`. Both are real now: the token is a JWT issued
 * by `POST /customers/auth/login` (F-01.02) and verified by the server
 * on every request. Nothing decided here is trusted by the API.
 *
 * Two-stage identity, and the staging is the point. The cached user in
 * localStorage paints immediately, so a returning shopper never sees
 * the header flicker from signed-out to signed-in. Then `/me` confirms
 * the token still belongs to a live account and overwrites the cache.
 * That second step is what makes an account closed from the admin
 * panel take effect on the shopper's next page load rather than
 * whenever their token happens to expire.
 *
 * A failed `/me` is not automatically a sign-out. A 401 is — the token
 * is genuinely no good. A network error is not: the API being down
 * should not log everybody out and throw away their session.
 *
 * The modal is rendered here, next to `children`, exactly as
 * StoreProvider renders its toast. That is what lets any component
 * anywhere in the storefront put up the sign-in dialog with
 * `openAuth()` and no prop drilling.
 *
 * What is gated, and what is not:
 *
 * - `/account` needs an account. Nothing else does.
 * - The bag and checkout stay open to guests — the shop would rather
 *   take the order than win the sign-up.
 * - The heart stays open too. A guest's saves live on the device and
 *   are folded into their account the moment they sign in.
 */

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { ApiError, NETWORK_ERROR } from "@/lib/api/client";
import * as customerAuth from "@/lib/store/auth";
import {
  clearSession,
  getServerSnapshot,
  getSnapshot,
  subscribe,
  writeSession,
  writeUser,
} from "@/lib/store/session";
import { AuthModal } from "./AuthModal";
import { adoptGuestWishlist, repointWishlist } from "./StoreProvider";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // `{ token, user }` or null. The session store is the single source
  // of truth, so a sign-out in another tab lands here too.
  const session = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const token = session?.token ?? null;
  const user = session?.user ?? null;

  // null when closed; otherwise { mode, reason, redirectTo } — the
  // reason is shown in the dialog so the shopper knows why they were
  // interrupted.
  const [intent, setIntent] = useState(null);

  const router = useRouter();
  const pathname = usePathname();

  // --------------------------------------------------------
  // CONFIRM THE STORED TOKEN
  // --------------------------------------------------------
  //
  // Once per token. `validated` is keyed by the token it belongs to,
  // so a sign-in or a sign-out re-arms the check without a second
  // flag to keep in step.

  const [validated, setValidated] = useState(null);

  useEffect(() => {
    if (!token || validated === token) return;

    const controller = new AbortController();
    let active = true;

    customerAuth
      .fetchCurrentCustomer(token, controller.signal)
      .then((fresh) => {
        if (!active) return;

        setValidated(token);

        // The shop may have corrected a name or a phone number since
        // this device last looked.
        if (fresh) writeUser(fresh);
      })
      .catch((error) => {
        if (!active || error?.name === "AbortError") return;

        // The API is unreachable. Keep the session — it is probably
        // still valid once the backend is back — and try again on the
        // next mount rather than signing the shopper out of a shop
        // they can still browse from the snapshot.
        if (error instanceof ApiError && error.code === NETWORK_ERROR) {
          return;
        }

        // 401/403: the token is genuinely no good, or the account was
        // closed. Drop it rather than retrying with it forever.
        setValidated(token);
        clearSession();
        repointWishlist(null);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [token, validated]);

  const closeAuth = useCallback(() => setIntent(null), []);

  const openAuth = useCallback((options = {}) => {
    setIntent({
      mode: options.mode === "signup" ? "signup" : "signin",
      reason: options.reason ?? null,
      redirectTo: options.redirectTo ?? null,
    });
  }, []);

  const value = useMemo(() => {
    /** Shared tail of both flows: adopt, remember, close, and go where asked. */
    const land = (account, issuedToken) => {
      // Adopt before the session is written, so the wishlist is already
      // the account's by the time anything re-renders against the new
      // user.
      adoptGuestWishlist(account.id);
      writeSession(issuedToken, account);

      // The token that just arrived is by definition fresh, so there is
      // nothing for the /me effect to confirm.
      setValidated(issuedToken);

      // Signing in from the header's person icon on `/account` itself
      // would otherwise push a second identical entry onto the history
      // stack, and the back button would appear to do nothing.
      const to = intent?.redirectTo;
      setIntent(null);
      if (to && to !== pathname) router.push(to);
    };

    return {
      user,
      isSignedIn: Boolean(user),

      signIn: async (credentials) => {
        const result = await customerAuth.signIn(credentials);
        if (result.ok) land(result.user, result.token);
        return result;
      },

      signUp: async (details) => {
        const result = await customerAuth.register(details);
        if (result.ok) land(result.user, result.token);
        return result;
      },

      signOut: async () => {
        const current = token;

        // Clear locally first — signing out must not depend on the
        // network.
        clearSession();
        setValidated(null);
        repointWishlist(null);

        await customerAuth.signOut(current);
      },

      /** Edits the shopper's own name, email or phone (F-05.06). */
      updateProfile: async (fields) => {
        const result = await customerAuth.updateProfile(fields, token);
        if (result.ok) writeUser(result.user);
        return result;
      },

      /** Changes the shopper's own password (F-05.06). */
      changePassword: async (passwords) =>
        customerAuth.changePassword(user?.id, passwords, token),

      openAuth,
      closeAuth,
    };
  }, [user, token, intent, router, pathname, openAuth, closeAuth]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthModal
        intent={intent}
        signIn={value.signIn}
        signUp={value.signUp}
        closeAuth={closeAuth}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}
