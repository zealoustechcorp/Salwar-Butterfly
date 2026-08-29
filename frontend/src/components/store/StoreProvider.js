"use client";

/**
 * Frontend-only shopper state: bag (F-07) and wishlist.
 *
 * There is no backend behind the storefront yet, so the bag lives in
 * localStorage. It is held in a tiny external store read through
 * `useSyncExternalStore` rather than in component state seeded by an effect:
 * the server snapshot is empty, so the server render and its hydration always
 * agree, and React swaps in the stored bag immediately afterwards.
 *
 * When F-07's cart API lands, `addToBag` / `toggleWish` become fetch calls and
 * nothing that consumes `useStore()` has to change.
 */

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";

const BAG_KEY = "sb.bag";
const WISH_KEY = "sb.wishlist";

// --- external store ---------------------------------------------------------

const EMPTY = { bag: [], wishlist: [] };

let snapshot = EMPTY;
let loaded = false;
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
    snapshot = { bag: read(BAG_KEY), wishlist: read(WISH_KEY) };
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

function commit(next) {
  snapshot = next;
  persist(BAG_KEY, next.bag);
  persist(WISH_KEY, next.wishlist);
  for (const listener of listeners) listener();
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
    const addToBag = (product, { size } = {}) => {
      const pickedSize = size || product.available_sizes[0] || null;
      const key = `${product.id}:${pickedSize ?? "-"}`;
      const existing = bag.find((line) => line.key === key);

      commit({
        wishlist,
        bag: existing
          ? bag.map((line) => (line.key === key ? { ...line, qty: line.qty + 1 } : line))
          : [
              ...bag,
              {
                key,
                product_id: product.id,
                name: product.name,
                price: product.price,
                size: pickedSize,
                image: product.image,
                qty: 1,
              },
            ],
      });
      setToast({
        title: "Added to bag",
        detail: pickedSize ? `${product.name} · size ${pickedSize}` : product.name,
      });
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
