"use client";

/**
 * @file context.js
 * @description Category state for the `/admin/category` route tree.
 *
 * Backed by the Express API — every category (paged through, see
 * `listCategories`) on mount, and a write endpoint behind every mutation.
 * There is no seed data: an empty panel means an empty `categories` table.
 *
 * Products are loaded alongside categories because every category view
 * reports on its linkage (how many products, which ones, are they live).
 * Their failure is not fatal — a category list is still worth rendering
 * when the products endpoint is down — but it is not hidden either: it is
 * reported as `productsError`, and each category's `productIds` is `null`
 * (unknown) rather than an empty array, so no screen shows "0 products"
 * for a category whose products simply could not be read.
 *
 * Mutations are async and throw `ApiError` — the pages await them and
 * report failures through the toast layer rather than pretending a save
 * succeeded.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createCategory,
  getCategory,
  listCategories,
  updateCategory,
} from "@/lib/api/categories";
import { assignProductsToCategory, listAllProducts } from "@/lib/api/products";

const CategoryContext = createContext(null);

/** Stable identity, so consumers do not re-render on every loading pass. */
const EMPTY = [];
const NO_IDS = new Set();

/**
 * Thrown by `saveCategory` when the category itself was written but the
 * product move that followed it was refused.
 *
 * The two requests are separate (`createCategory`/`updateCategory`, then
 * `bulkUpdateCategory`), so "the save failed" is the wrong report for
 * this case: the category exists, and a create retried as a create runs
 * straight into "slug already exists". Callers read `category` to switch
 * the form over to editing what was saved, so the retry only re-sends
 * the move.
 */
export class ProductMoveError extends Error {
  /**
   * @param {Object} category - the category as the API saved it
   * @param {Error} cause - the move's own failure
   */
  constructor(category, cause) {
    super(
      `${category.name} was saved, but the selected products were not moved into it` +
        (cause?.message ? `: ${cause.message}` : "."),
    );
    this.name = "ProductMoveError";
    this.category = category;
    this.cause = cause;
    this.code = cause?.code ?? null;
    this.status = cause?.status ?? 0;
    // No field of the category form is at fault.
    this.fields = {};
  }
}

/** `(prev) => partial` that inserts or replaces one category. */
const upsert = (category) => (prev) => ({
  categories: prev.categories.some((c) => c.id === category.id)
    ? prev.categories.map((c) => (c.id === category.id ? category : c))
    : // The API lists newest first, so a new one belongs at the top.
      [category, ...prev.categories],
});

/**
 * CategoryProvider Component
 *
 * State provided to consumers:
 * - `categories`: category records, each decorated with the `productIds`
 *   currently pointing at it (`null` when products failed to load).
 * - `products`: the catalogue, for product pickers and linkage counts.
 * - `productsError`: why `products` is empty when it could not be read.
 * - `status`: "loading" | "ready" | "error".
 * - `error`: the ApiError behind an "error" status.
 * - `refresh()`: re-fetch both collections.
 * - `toggleActive(id)`: flip storefront visibility (optimistic).
 * - `isToggling(id)`: whether a flip for that category is in flight.
 * - `saveCategory(data)`: create or update, then apply any product moves.
 * - `remember(category)`: add one category fetched on its own.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children
 */
export function CategoryProvider({ children }) {
  /** Bumped by refresh() to re-run the load effect. */
  const [reloadKey, setReloadKey] = useState(0);

  /**
   * `{ key, categories, products, productsError, error }` — one load's
   * result, tagged with the reloadKey it answers. Status is derived from
   * that pairing rather than stored, so a refresh cannot leave a stale
   * list behind and the effect never has to set a "loading" flag on its
   * way in.
   */
  const [snapshot, setSnapshot] = useState(null);

  /**
   * Writes made while a load is in flight. That load's request went out
   * before the write landed, so its answer can be older than the write —
   * a category created from `/admin/category/new` before the list had
   * arrived would otherwise vanish when the list did. Each update is
   * replayed onto the snapshot as it lands. Cleared when a new load
   * starts, since that request is sent after every write so far.
   */
  const loading = useRef(false);
  const pending = useRef([]);

  /** Ids with a visibility flip in flight — see `toggleActive`. */
  const toggling = useRef(new Set());
  const [togglingIds, setTogglingIds] = useState(NO_IDS);

  const isCurrent = snapshot !== null && snapshot.key === reloadKey;
  const failed = isCurrent && snapshot.error !== null;

  const status = !isCurrent ? "loading" : failed ? "error" : "ready";
  const error = failed ? snapshot.error : null;
  const categories = isCurrent && !failed ? snapshot.categories : EMPTY;
  const products = isCurrent && !failed ? snapshot.products : EMPTY;
  const productsError = isCurrent && !failed ? snapshot.productsError : null;

  // --------------------------------------------------------
  // LOAD
  // --------------------------------------------------------

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    loading.current = true;
    pending.current = [];

    let productsFailure = null;

    Promise.all([
      listCategories({ signal: controller.signal }),
      // A products outage should not blank the category list — but it is
      // recorded, so the screens can say the counts are unknown.
      listAllProducts({ signal: controller.signal }).catch((productsLoadError) => {
        if (productsLoadError?.name === "AbortError") throw productsLoadError;

        productsFailure = productsLoadError;
        return EMPTY;
      }),
    ])
      .then(([list, rows]) => {
        if (!active) return;

        let next = {
          key: reloadKey,
          categories: list.categories,
          products: rows,
          productsError: productsFailure,
          error: null,
        };

        for (const update of pending.current) next = { ...next, ...update(next) };

        loading.current = false;
        pending.current = [];
        setSnapshot(next);
      })
      .catch((loadError) => {
        // An abort is an unmount, not a failure.
        if (!active || loadError?.name === "AbortError") return;

        loading.current = false;
        pending.current = [];
        setSnapshot({
          key: reloadKey,
          categories: EMPTY,
          products: EMPTY,
          productsError: null,
          error: loadError,
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  /**
   * Applies a mutation to the loaded snapshot — and, while a load is in
   * flight, queues it for replay onto that load's answer.
   */
  const patch = useCallback((update) => {
    if (loading.current) pending.current.push(update);

    setSnapshot((prev) => (prev ? { ...prev, ...update(prev) } : prev));
  }, []);

  // --------------------------------------------------------
  // DERIVED
  // --------------------------------------------------------

  /**
   * `productIds` is not a column — the link lives on the product side
   * (`products.category_id`), so it is derived here and every consumer
   * reads one consistent view of it.
   */
  const decorated = useMemo(
    () =>
      categories.map((category) => ({
        ...category,
        productIds: productsError
          ? null
          : products
              .filter((product) => product.categoryId === category.id)
              .map((product) => product.id),
      })),
    [categories, products, productsError],
  );

  // --------------------------------------------------------
  // MUTATIONS
  // --------------------------------------------------------

  const isToggling = useCallback((id) => togglingIds.has(id), [togglingIds]);

  /**
   * Flips a category's storefront visibility. Applied locally first so
   * the switch responds immediately, and rolled back if the API refuses.
   *
   * One flip per category at a time. Two quick clicks used to send
   * `active=false` then `active=true` with each rollback/confirmation
   * computed from its own stale `target`, so whichever response landed
   * last decided the switch — not necessarily the request the server
   * applied last. A second click while one is in flight is ignored (the
   * toggles are disabled for that window too, via `isToggling`).
   *
   * @param {string} id
   * @returns {Promise<Object|null>} the saved category, or null if skipped
   */
  const toggleActive = useCallback(
    async (id) => {
      const target = categories.find((c) => c.id === id);
      if (!target || toggling.current.has(id)) return null;

      const next = !target.active;

      const replace = (category) => (prev) => ({
        categories: prev.categories.map((c) => (c.id === id ? category(c) : c)),
      });

      toggling.current.add(id);
      setTogglingIds(new Set(toggling.current));
      patch(replace((c) => ({ ...c, active: next })));

      try {
        const saved = await updateCategory(id, { active: next });
        patch(replace(() => saved));
        return saved;
      } catch (updateError) {
        patch(replace((c) => ({ ...c, active: target.active })));
        throw updateError;
      } finally {
        toggling.current.delete(id);
        setTogglingIds(new Set(toggling.current));
      }
    },
    [categories, patch],
  );

  /**
   * Creates or updates a category, then moves any newly checked products
   * into it.
   *
   * Only additions are sent: `products.category_id` is NOT NULL, so a
   * product always belongs to exactly one category and "unlinking" is
   * really "link somewhere else" — the form reflects that by locking
   * products that are already here.
   *
   * The saved category is recorded *before* the move is attempted. If the
   * move then fails, the category is already in the list (it exists on
   * the server either way) and `ProductMoveError` reports the two
   * outcomes separately instead of calling the whole save a failure.
   *
   * @param {Object} data - name, slug, description, active, imageFile,
   *                        productIds, and `id` when editing
   * @returns {Promise<Object>} the saved category
   * @throws {ProductMoveError} saved, but the product move was refused
   */
  const saveCategory = useCallback(
    async (data) => {
      const { id, productIds = [], ...fields } = data;

      const saved = id
        ? await updateCategory(id, fields)
        : await createCategory(fields);

      patch(upsert(saved));

      const alreadyLinked = products
        .filter((product) => product.categoryId === saved.id)
        .map((product) => product.id);

      const added = productIds.filter((pid) => !alreadyLinked.includes(pid));

      if (added.length) {
        try {
          await assignProductsToCategory(saved.id, added);
        } catch (moveError) {
          throw new ProductMoveError(saved, moveError);
        }

        patch((prev) => ({
          products: prev.products.map((product) =>
            added.includes(product.id)
              ? { ...product, categoryId: saved.id }
              : product,
          ),
        }));
      }

      return saved;
    },
    [products, patch],
  );

  /** Adds (or refreshes) one category fetched outside the list load. */
  const remember = useCallback((category) => patch(upsert(category)), [patch]);

  const value = useMemo(
    () => ({
      categories: decorated,
      products,
      productsError,
      status,
      error,
      refresh,
      toggleActive,
      isToggling,
      saveCategory,
      remember,
    }),
    [
      decorated,
      products,
      productsError,
      status,
      error,
      refresh,
      toggleActive,
      isToggling,
      saveCategory,
      remember,
    ],
  );

  return (
    <CategoryContext.Provider value={value}>{children}</CategoryContext.Provider>
  );
}

/**
 * Custom React Hook to consume the CategoryContext.
 *
 * @throws {Error} If called outside of CategoryProvider
 */
export function useCategories() {
  const ctx = useContext(CategoryContext);

  if (!ctx) {
    throw new Error("useCategories must be used within a CategoryProvider");
  }

  return ctx;
}

/**
 * One category by id, for the detail and edit screens.
 *
 * Read from the loaded list first; when the list has loaded and the id is
 * not in it — created in another tab since, or the list walk stopped
 * early — it is fetched on its own (`getCategoryById`) and added to the
 * list, rather than declared "not found" on the strength of a list that
 * may simply be behind.
 *
 * @param {string} id
 * @returns {{ status: "loading"|"ready"|"missing"|"error", category: Object|null,
 *             error: Error|null, retry: Function }}
 */
export function useCategory(id) {
  const { categories, status, error, refresh, remember } = useCategories();

  const listed = categories.find((c) => c.id === id) ?? null;

  /** `{ id, outcome: "missing"|"error", error }` for the last lookup. */
  const [lookup, setLookup] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const needsLookup = status === "ready" && !listed;

  useEffect(() => {
    if (!needsLookup) return undefined;

    const controller = new AbortController();
    let active = true;

    getCategory(id, { signal: controller.signal })
      .then((found) => {
        if (!active) return;

        if (found) remember(found);
        else setLookup({ id, outcome: "missing", error: null });
      })
      .catch((lookupError) => {
        if (!active || lookupError?.name === "AbortError") return;

        // 404, or an id the validator refuses outright, is a genuine
        // "no such category"; anything else is a failure worth a retry.
        const missing = lookupError?.status === 404 || lookupError?.status === 400;

        setLookup({
          id,
          outcome: missing ? "missing" : "error",
          error: missing ? null : lookupError,
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [id, needsLookup, attempt, remember]);

  const retryLookup = useCallback(() => {
    setLookup(null);
    setAttempt((n) => n + 1);
  }, []);

  if (status === "loading") {
    return { status: "loading", category: null, error: null, retry: refresh };
  }

  if (status === "error") {
    return { status: "error", category: null, error, retry: refresh };
  }

  if (listed) return { status: "ready", category: listed, error: null, retry: refresh };

  const settled = lookup?.id === id ? lookup : null;

  if (settled?.outcome === "missing") {
    return { status: "missing", category: null, error: null, retry: retryLookup };
  }

  if (settled?.outcome === "error") {
    return { status: "error", category: null, error: settled.error, retry: retryLookup };
  }

  return { status: "loading", category: null, error: null, retry: refresh };
}
