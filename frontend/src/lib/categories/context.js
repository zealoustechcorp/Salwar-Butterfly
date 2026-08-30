"use client";

/**
 * @file context.js
 * @description Category state for the `/admin/category` route tree.
 *
 * Backed by the Express API — `GET /api/categories/getAllCategories` on
 * mount, and a write endpoint behind every mutation. There is no seed
 * data: an empty panel means an empty `categories` table.
 *
 * Products are loaded alongside categories because every category view
 * reports on its linkage (how many products, which ones, are they live).
 * Their failure is not fatal: a category list is still worth rendering
 * when the products endpoint is down, so the product load degrades to an
 * empty array instead of erroring the whole tree.
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
  useState,
} from "react";

import {
  assignProductsToCategory,
  createCategory,
  listAllProducts,
  listCategories,
  updateCategory,
} from "@/lib/api/categories";

const CategoryContext = createContext(null);

/** Stable identity, so consumers do not re-render on every loading pass. */
const EMPTY = [];

/**
 * CategoryProvider Component
 *
 * State provided to consumers:
 * - `categories`: category records, each decorated with the `productIds`
 *   currently pointing at it.
 * - `products`: the catalogue, for product pickers and linkage counts.
 * - `status`: "loading" | "ready" | "error".
 * - `error`: the ApiError behind an "error" status.
 * - `refresh()`: re-fetch both collections.
 * - `toggleActive(id)`: flip storefront visibility (optimistic).
 * - `saveCategory(data)`: create or update, then apply any product moves.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children
 */
export function CategoryProvider({ children }) {
  /** Bumped by refresh() to re-run the load effect. */
  const [reloadKey, setReloadKey] = useState(0);

  /**
   * `{ key, categories, products, error }` — one load's result, tagged
   * with the reloadKey it answers. Status is derived from that pairing
   * rather than stored, so a refresh cannot leave a stale list behind
   * and the effect never has to set a "loading" flag on its way in.
   */
  const [snapshot, setSnapshot] = useState(null);

  const isCurrent = snapshot !== null && snapshot.key === reloadKey;
  const failed = isCurrent && snapshot.error !== null;

  const status = !isCurrent ? "loading" : failed ? "error" : "ready";
  const error = failed ? snapshot.error : null;
  const categories = isCurrent && !failed ? snapshot.categories : EMPTY;
  const products = isCurrent && !failed ? snapshot.products : EMPTY;

  // --------------------------------------------------------
  // LOAD
  // --------------------------------------------------------

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    Promise.all([
      listCategories({ signal: controller.signal }),
      // A products outage should not blank the category list.
      listAllProducts({ signal: controller.signal }).catch(() => []),
    ])
      .then(([list, rows]) => {
        if (!active) return;

        setSnapshot({
          key: reloadKey,
          categories: list.categories,
          products: rows,
          error: null,
        });
      })
      .catch((loadError) => {
        // An abort is an unmount, not a failure.
        if (!active || loadError?.name === "AbortError") return;

        setSnapshot({
          key: reloadKey,
          categories: EMPTY,
          products: EMPTY,
          error: loadError,
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  /** Applies a mutation to the loaded snapshot, or does nothing if none. */
  const patch = useCallback((update) => {
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
        productIds: products
          .filter((product) => product.categoryId === category.id)
          .map((product) => product.id),
      })),
    [categories, products],
  );

  // --------------------------------------------------------
  // MUTATIONS
  // --------------------------------------------------------

  /**
   * Flips a category's storefront visibility. Applied locally first so
   * the switch responds immediately, and rolled back if the API refuses.
   *
   * @param {string} id
   */
  const toggleActive = useCallback(
    async (id) => {
      const target = categories.find((c) => c.id === id);
      if (!target) return;

      const next = !target.active;

      const replace = (category) => (prev) => ({
        categories: prev.categories.map((c) => (c.id === id ? category(c) : c)),
      });

      patch(replace((c) => ({ ...c, active: next })));

      try {
        const saved = await updateCategory(id, { active: next });
        patch(replace(() => saved));
      } catch (updateError) {
        patch(replace((c) => ({ ...c, active: target.active })));
        throw updateError;
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
   * @param {Object} data - name, slug, description, active, sizeCharts,
   *                        imageFile, productIds, and `id` when editing
   * @returns {Promise<Object>} the saved category
   */
  const saveCategory = useCallback(
    async (data) => {
      const { id, productIds = [], ...fields } = data;

      const saved = id
        ? await updateCategory(id, fields)
        : await createCategory(fields);

      const alreadyLinked = products
        .filter((product) => product.categoryId === saved.id)
        .map((product) => product.id);

      const added = productIds.filter((pid) => !alreadyLinked.includes(pid));

      if (added.length) {
        await assignProductsToCategory(saved.id, added);

        patch((prev) => ({
          products: prev.products.map((product) =>
            added.includes(product.id)
              ? { ...product, categoryId: saved.id }
              : product,
          ),
        }));
      }

      patch((prev) => ({
        categories: prev.categories.some((c) => c.id === saved.id)
          ? prev.categories.map((c) => (c.id === saved.id ? saved : c))
          : [...prev.categories, saved],
      }));

      return saved;
    },
    [products, patch],
  );

  const value = useMemo(
    () => ({
      categories: decorated,
      products,
      status,
      error,
      refresh,
      toggleActive,
      saveCategory,
    }),
    [decorated, products, status, error, refresh, toggleActive, saveCategory],
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
