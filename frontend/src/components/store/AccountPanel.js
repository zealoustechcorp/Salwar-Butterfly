"use client";

/**
 * The gate at the top of `/account`.
 *
 * `/account` is the one route that needs an account, but it is also where the
 * footer's Help column points — `/account#delivery`, `#sizes`, `#orders`. So
 * the route is not bounced or blanked for a guest: the shipping, sizing and
 * payment answers below stay public, and only this panel changes. That keeps
 * every footer link working while still putting the sign-in in front of anyone
 * who came here for their account.
 *
 * The dialog opens by itself on a bare visit to `/account`, since arriving here
 * *is* the request to sign in. It stays shut when the URL carries a hash,
 * because that visitor followed a link to the size guide and did not ask.
 */

import { LogOut, UserRound } from "lucide-react";
import { useEffect, useRef } from "react";

import { AccountSnapshot } from "./AccountSnapshot";
import { useAuth } from "./AuthProvider";
import { ProfileCard } from "./ProfileCard";

const SIGN_IN_REASON = "Sign in to see your account.";

export function AccountPanel() {
  const { user, isSignedIn, signOut, openAuth } = useAuth();
  const asked = useRef(false);

  useEffect(() => {
    // Once per visit, and only on arrival. Dismissing the dialog has to mean
    // something, and signing out from this page must not immediately re-open
    // the thing the shopper just used.
    if (asked.current || isSignedIn) return;
    asked.current = true;
    if (window.location.hash) return;
    openAuth({ reason: SIGN_IN_REASON });
  }, [isSignedIn, openAuth]);

  if (!isSignedIn) {
    return (
      <div className="mt-6 rounded-2xl border border-sb-gold/35 bg-sb-surface/25 p-5 sm:p-6">
        <UserRound className="size-6 text-sb-gold-text" aria-hidden="true" />
        <p className="mt-3 font-display text-xl font-semibold text-sb-heading">
          Sign in to see your account
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-sb-text">
          Your account holds your wishlist, so it follows you from your phone to
          your laptop instead of living on one browser. You do not need one to
          shop — the bag and checkout are open to everyone.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => openAuth({ reason: SIGN_IN_REASON })}
            className="inline-flex rounded-full bg-sb-btn-primary px-7 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => openAuth({ mode: "signup", reason: SIGN_IN_REASON })}
            className="inline-flex rounded-full border border-sb-gold/50 px-7 py-3 text-sm font-semibold text-sb-heading transition-colors hover:border-sb-heading hover:bg-sb-surface/40"
          >
            Create an account
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-sb-gold/35 bg-sb-surface/25 p-5 sm:p-6">
        <div className="min-w-0">
          <p className="sb-eyebrow text-[10px] text-sb-gold-text">Signed in</p>
          <p className="mt-2 font-display text-2xl font-semibold text-sb-heading">
            Hello, {user.name}
          </p>
          <p className="mt-1 truncate text-sm text-sb-text-muted">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="inline-flex items-center gap-2 rounded-full border border-sb-gold/50 px-5 py-2.5 text-sm font-semibold text-sb-heading transition-colors hover:border-sb-heading hover:bg-sb-surface/40"
        >
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </button>
      </div>

      <ProfileCard />
      <AccountSnapshot />
    </>
  );
}
