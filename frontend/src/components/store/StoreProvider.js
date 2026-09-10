"use client";

/**
 * Shopper state held on the device: bag (F-07) and wishlist.
 *
 * The bag stays in localStorage even now that checkout is real, and that is a
 * choice rather than a leftover. A cart API would mean a shopper cannot add
 * anything without an account, or that guest carts need their own server-side
 * identity and expiry — for a bag that is read on one device and posted once,
 * neither earns its cost. The bag becomes an order at checkout; until then it
 * is nobody's business but this browser's.
 *
 * It is held in a tiny external store read through
 * `useSyncExternalStore` rather than in component state seeded by an effect:
 * the server snapshot is empty, so the server render and its hydration always
 * agree, and React swaps in the stored bag immediately afterwards.
 *
 * The two lists are owned differently, and deliberately so:
 *
 * - The **bag belongs to the device**. Checkout is open to guests, so signing
 *   in or out mid-purchase must never empty it.
 * - The **wishlist belongs to whoever is signed in**, and for a signed-in
 *   shopper it belongs to the *server*. A guest gets a list on this device;
 *   signing in folds that list into the account's, and from then on the API
 *   is the authority and localStorage is only a cache for first paint. That
 *   is what makes a piece saved on a phone show up on a laptop, which keying
 *   a device-local list by account never could.
 *
 * How the server-backed half works, in one place so it is not scattered:
 *
 *   The list on screen is always the local snapshot, so a heart fills the
 *   instant it is tapped. Every change is written to the API immediately
 *   afterwards, and the API answers with the whole list, which replaces the
 *   local one. A write that fails puts the previous list back and says so —
 *   silently keeping an optimistic value would leave a heart filled for a
 *   piece the account has not actually saved.
 *
 *   Nothing here blocks on the network. A shopper with no connection still
 *   gets a working wishlist on this device; it reconciles on the next load.
 */

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { readSession, readToken } from "@/lib/store/session";
import { cn } from "@/lib/utils";
import {
  fetchWishlist,
  mergeWishlist,
  removeFromWishlist,
  saveToWishlist,
} from "@/lib/store/wishlist";

const BAG_KEY = "sb.bag";
const GUEST_WISH_KEY = "sb.wishlist";

/** Guests keep the unsuffixed key, so an existing device list is not orphaned. */
function wishKeyFor(userId) {
  return userId ? `${GUEST_WISH_KEY}:${userId}` : GUEST_WISH_KEY;
}

// --- external store ---------------------------------------------------------

const EMPTY = { bag: [], wishlist: [] };

let snapshot = EMPTY;
let loaded = false;
// Which account's wishlist `snapshot.wishlist` currently holds. Resolved from
// the stored session on the first read so that a shopper who is already signed
// in never sees the guest list flash past first.
let activeUserId = null;
const listeners = new Set();

function read(key) {
  try {
    const raw = window.localStorage.getItem(key);
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value : [];
  } catch {
    return []; // private mode, quota, or a stale shape — start clean
  }
}

function persist(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage is a convenience here, never a correctness dependency */
  }
}

/** Must stay pure and referentially stable, so the read happens exactly once. */
function getSnapshot() {
  if (!loaded) {
    loaded = true;
    activeUserId = readSession()?.id ?? null;
    snapshot = { bag: read(BAG_KEY), wishlist: read(wishKeyFor(activeUserId)) };
  }
  return snapshot;
}

function getServerSnapshot() {
  return EMPTY;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

function commit(next) {
  snapshot = next;
  persist(BAG_KEY, next.bag);
  persist(wishKeyFor(activeUserId), next.wishlist);
  notify();
}

/**
 * Replaces the wishlist with what the server says it is.
 *
 * Guarded on the account not having changed underneath: a response for the
 * shopper who signed out while it was in flight must not land on the next
 * person's screen.
 */
function commitServerWishlist(userId, ids) {
  if (activeUserId !== userId) return;

  commit({ bag: getSnapshot().bag, wishlist: ids });
}

// --- the server-backed half -------------------------------------------------

/**
 * Pulls the account's list on load.
 *
 * Called once <StoreProvider> mounts with a session already in storage — the
 * returning shopper who never went through a sign-in this page load, and so
 * never triggered `adoptGuestWishlist`. Without this, their saves from another
 * device would not appear until they signed in again.
 *
 * A failure is left alone deliberately. The cached list is already on screen
 * and is very probably right; replacing it with an empty one because the API
 * was briefly unreachable would look exactly like the shop having lost it.
 */
export async function syncWishlistFromServer() {
  const token = readToken();
  const userId = readSession()?.id ?? null;

  if (!token || !userId) return;

  const result = await fetchWishlist(token);

  if (result.ok) commitServerWishlist(userId, result.ids);
}

// --- account hand-off -------------------------------------------------------
//
// Called by <AuthProvider> on sign-in and sign-out. They live here rather than
// there because the wishlist's storage layout is this module's business, and
// keeping them here means AuthProvider and StoreProvider never import each
// other — both go through `@/lib/store/session` instead.

/**
 * Signing in: fold whatever this device saved as a guest into the account's own
 * list, then show that list.
 *
 * The guest key is cleared once its contents have been adopted. That is what
 * makes sign-out safe — on a shared phone the next visitor gets an empty list
 * rather than the previous shopper's saves.
 *
 * Two merges happen, and both are needed. The local one runs synchronously so
 * the header's count is right in the same frame the dialog closes. The server
 * one follows, sending the guest ids up and taking the account's real list —
 * which may hold pieces saved on another device that this browser has never
 * heard of — back as the answer.
 *
 * Not awaited by its caller. Signing in must not wait on the wishlist.
 */
export function adoptGuestWishlist(userId) {
  if (!userId) return;
  const { bag } = getSnapshot(); // also guarantees the bag has been read in
  const guestIds = read(GUEST_WISH_KEY);
  const merged = [...new Set([...read(wishKeyFor(userId)), ...guestIds])];

  persist(wishKeyFor(userId), merged);
  persist(GUEST_WISH_KEY, []);

  activeUserId = userId;
  snapshot = { bag, wishlist: merged };
  notify();

  // The token is written before this is called, so it is there to read.
  const token = readToken();

  if (!token) return;

  mergeWishlist(guestIds, token).then((result) => {
    if (result.ok) commitServerWishlist(userId, result.ids);
  });
}

/** Signing out: point back at the (now empty) guest list. The bag is untouched. */
export function repointWishlist(userId) {
  const next = userId ?? null;
  const { bag } = getSnapshot();
  if (activeUserId === next) return;

  activeUserId = next;
  snapshot = { bag, wishlist: read(wishKeyFor(next)) };
  notify();
}

// --- provider ---------------------------------------------------------------

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const { bag, wishlist } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [toast, setToast] = useState(null);

  // A toast carrying a link stays up longer: 2.6s is enough to read a
  // confirmation but not enough to notice a button, decide, and reach it.
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), toast.action ? 5200 : 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  /**
   * The returning shopper: already signed in when the page loaded, so no
   * sign-in happened to fold their list in. Their cached list is on screen
   * already; this replaces it with the account's, which may have gained
   * pieces on another device since this browser last looked.
   *
   * Once, on mount. Sign-in and sign-out are handled by the hand-off
   * functions above, which the auth provider calls.
   */
  useEffect(() => {
    syncWishlistFromServer();
  }, []);

  const value = useMemo(() => {
    /**
     * `qty` is how many to add, not the new total — a card adds one, the
     * product page adds whatever its stepper says. The line is capped at the
     * same 99 the bag's own stepper enforces.
     *
     * The line records `variant_id`, looked up from the chosen size. That is
     * the only field checkout actually orders against — the API prices and
     * reserves against a product_variants row, and a size label identifies
     * nothing it can sell. The rest is display: enough to render the bag
     * without re-reading the catalogue, and re-priced by the server anyway.
     */
    const addToBag = (product, { size, qty = 1 } = {}) => {
      const pickedSize = size || product.available_sizes[0] || null;
      const variant = product.sizes?.find((row) => row.size === pickedSize) ?? null;
      const key = `${product.id}:${pickedSize ?? "-"}`;
      const existing = bag.find((line) => line.key === key);
      const adding = Math.max(1, Math.min(99, Math.trunc(Number(qty)) || 1));

      commit({
        wishlist,
        bag: existing
          ? bag.map((line) =>
              line.key === key
                ? {
                    ...line,
                    qty: Math.min(99, line.qty + adding),
                    // Heals a line saved before the variant ids existed, so a
                    // bag left on a device before this change can still check
                    // out instead of failing at the last step.
                    variant_id: line.variant_id ?? variant?.variant_id ?? null,
                  }
                : line,
            )
          : [
              ...bag,
              {
                key,
                product_id: product.id,
                variant_id: variant?.variant_id ?? null,
                name: product.name,
                price: product.price,
                size: pickedSize,
                image: product.image,
                qty: adding,
              },
            ],
      });
      setToast({
        title: "Added to bag",
        detail: [
          product.name,
          pickedSize ? `size ${pickedSize}` : null,
          adding > 1 ? `× ${adding}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        action: { href: "/bag", label: "View bag" },
      });
    };

    /** Quantity stepper on the bag page. Dropping to zero removes the line. */
    const setQty = (key, qty) => {
      const next = Math.max(0, Math.min(99, Math.trunc(Number(qty)) || 0));
      commit({
        wishlist,
        bag:
          next === 0
            ? bag.filter((line) => line.key !== key)
            : bag.map((line) => (line.key === key ? { ...line, qty: next } : line)),
      });
    };

    const removeLine = (key) => {
      const line = bag.find((entry) => entry.key === key);
      commit({ wishlist, bag: bag.filter((entry) => entry.key !== key) });
      if (line) setToast({ title: "Removed from bag", detail: line.name });
    };

    const clearBag = () => {
      commit({ wishlist, bag: [] });
      setToast({ title: "Bag emptied", detail: "Nothing left to check out" });
    };

    /**
     * The heart on a card.
     *
     * Optimistic: the icon fills before anything is sent, because a heart
     * that waits on a round trip feels broken. For a guest that is the whole
     * story — the device list is the only list there is. For a signed-in
     * shopper the write follows, and the server's answer replaces what was
     * assumed here.
     *
     * A failed write puts the previous list back rather than leaving the
     * optimistic one in place. A filled heart for a piece the account did not
     * save is worse than an honest failure: it survives a reload as an empty
     * heart, and the shopper never finds out which of the two was true.
     */
    const toggleWish = (product) => {
      const saved = wishlist.includes(product.id);
      const previous = wishlist;

      const next = saved
        ? wishlist.filter((id) => id !== product.id)
        : [...wishlist, product.id];

      commit({ bag, wishlist: next });

      // Only the save offers the trip — after a remove there is nothing new
      // on the wishlist to go and look at.
      setToast({
        title: saved ? "Removed from wishlist" : "Saved to wishlist",
        detail: product.name,
        action: saved ? null : { href: "/wishlist", label: "View wishlist" },
      });

      const token = readToken();
      const userId = activeUserId;

      if (!token || !userId) return;

      const write = saved
        ? removeFromWishlist(product.id, token)
        : saveToWishlist(product.id, token);

      write.then((result) => {
        if (result.ok) {
          commitServerWishlist(userId, result.ids);
          return;
        }

        commitServerWishlist(userId, previous);

        setToast({
          title: saved ? "Could not remove that" : "Could not save that",
          detail: result.error,
        });
      });
    };

    return {
      bag,
      wishlist,
      addToBag,
      setQty,
      removeLine,
      clearBag,
      toggleWish,
      bagCount: bag.reduce((sum, line) => sum + line.qty, 0),
      bagTotal: bag.reduce((sum, line) => sum + line.qty * line.price, 0),
      wishCount: wishlist.length,
    };
  }, [bag, wishlist]);

  return (
    <StoreContext.Provider value={value}>
      {children}
      {/* Taking the link dismisses the strip rather than letting it ride the
          navigation and sit on top of the page it just opened. */}
      <Toast toast={toast} onAction={() => setToast(null)} />
    </StoreContext.Provider>
  );
}

function Toast({ toast, onAction }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4"
    >
      {toast ? (
        // The strip itself stays click-through; only the button inside takes
        // pointer events, so a toast over a product tile never eats a tap.
        <div
          className={cn(
            "sb-enter flex max-w-full items-center gap-3 rounded-full bg-sb-footer py-2.5 pl-5 text-sb-bg shadow-lg shadow-sb-footer/25",
            toast.action ? "pr-2" : "pr-5",
          )}
        >
          <span className="shrink-0 text-sm font-medium">{toast.title}</span>
          <span className="hidden min-w-0 truncate text-xs text-sb-bg/70 sm:inline">
            {toast.detail}
          </span>
          {toast.action ? (
            <Link
              href={toast.action.href}
              onClick={onAction}
              className="pointer-events-auto shrink-0 rounded-full bg-sb-bg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap text-sb-footer transition-colors hover:bg-sb-btn-rose hover:text-sb-bg"
            >
              {toast.action.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside <StoreProvider>.");
  return context;
}
