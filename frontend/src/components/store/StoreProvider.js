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
 * - The **wishlist belongs to whoever is signed in**. A guest gets a list on
 *   this device; signing in adopts that list into the account and from then on
 *   the account's list is the one on screen. See `adoptGuestWishlist`.
 */

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { readSession } from "@/lib/store/session";

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
 */
export function adoptGuestWishlist(userId) {
  if (!userId) return;
  const { bag } = getSnapshot(); // also guarantees the bag has been read in
  const merged = [...new Set([...read(wishKeyFor(userId)), ...read(GUEST_WISH_KEY)])];

  persist(wishKeyFor(userId), merged);
  persist(GUEST_WISH_KEY, []);

  activeUserId = userId;
  snapshot = { bag, wishlist: merged };
  notify();
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

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

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

    const toggleWish = (product) => {
      const saved = wishlist.includes(product.id);
      commit({
        bag,
        wishlist: saved
          ? wishlist.filter((id) => id !== product.id)
          : [...wishlist, product.id],
      });
      setToast({
        title: saved ? "Removed from wishlist" : "Saved to wishlist",
        detail: product.name,
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
      <Toast toast={toast} />
    </StoreContext.Provider>
  );
}

function Toast({ toast }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4"
    >
      {toast ? (
        <div className="sb-enter flex items-center gap-3 rounded-full bg-sb-footer px-5 py-2.5 text-sb-bg shadow-lg shadow-sb-footer/25">
          <span className="text-sm font-medium">{toast.title}</span>
          <span className="hidden text-xs text-sb-bg/70 sm:inline">{toast.detail}</span>
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
