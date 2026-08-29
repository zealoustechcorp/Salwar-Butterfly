"use client";

/**
 * Who is signed in, and the one modal that asks.
 *
 * Same shape as <StoreProvider>: a tiny external store read through
 * `useSyncExternalStore`, with an empty server snapshot so the server render
 * and its hydration always agree. The credential work itself lives in
 * `@/lib/store/session` — read the warning at the top of that file, because
 * none of this is real security until the backend grows an auth route.
 *
 * The modal is rendered here, next to `children`, exactly as StoreProvider
 * renders its toast. That is what lets any component anywhere in the storefront
 * put up the sign-in dialog with `openAuth()` and no prop drilling.
 *
 * What is gated, and what is not:
 *
 * - `/account` needs an account. Nothing else does.
 * - The bag and checkout stay open to guests — the shop would rather take the
 *   order than win the sign-up.
 * - The heart stays open too. A guest's saves live on the device and are folded
 *   into their account the moment they sign in.
 */

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import {
  clearSession,
  createAccount,
  readSession,
  verifyAccount,
  writeSession,
} from "@/lib/store/session";
import { AuthModal } from "./AuthModal";
import { adoptGuestWishlist, repointWishlist } from "./StoreProvider";

// --- external store ---------------------------------------------------------

let snapshot = null;
let loaded = false;
const listeners = new Set();

/** Must stay pure and referentially stable, so the read happens exactly once. */
function getSnapshot() {
  if (!loaded) {
    loaded = true;
    snapshot = readSession();
  }
  return snapshot;
}

function getServerSnapshot() {
  return null; // nobody is signed in as far as the server is concerned
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function commit(user) {
  snapshot = user;
  for (const listener of listeners) listener();
}

// --- provider ---------------------------------------------------------------

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const user = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // null when closed; otherwise { mode, reason, redirectTo } — the reason is
  // shown in the dialog so the shopper knows why they were interrupted.
  const [intent, setIntent] = useState(null);
  const router = useRouter();
  const pathname = usePathname();

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
    const land = (account) => {
      // Adopt before the session is written, so the wishlist is already the
      // account's by the time anything re-renders against the new user.
      adoptGuestWishlist(account.id);
      writeSession(account);
      commit(account);

      // Signing in from the header's person icon on `/account` itself would
      // otherwise push a second identical entry onto the history stack, and the
      // back button would appear to do nothing.
      const to = intent?.redirectTo;
      setIntent(null);
      if (to && to !== pathname) router.push(to);
    };

    return {
      user,
      isSignedIn: Boolean(user),

      signIn: async (credentials) => {
        const result = await verifyAccount(credentials);
        if (result.ok) land(result.user);
        return result;
      },

      signUp: async (details) => {
        const result = await createAccount(details);
        if (result.ok) land(result.user);
        return result;
      },

      signOut: () => {
        clearSession();
        commit(null);
        repointWishlist(null);
      },

      openAuth,
      closeAuth,
    };
  }, [user, intent, router, pathname, openAuth, closeAuth]);

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
