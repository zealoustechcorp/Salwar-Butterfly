"use client";

/**
 * Shared browse state for the storefront.
 *
 * The header search, the category tiles, the fabric chips and `/shop`'s
 * sidebar all steer the same grid, so the filter lives above them rather than
 * inside it. On the home page that grid is a section further down; on `/shop`
 * it is the page. Both read the same state, which is why a category tile on
 * the home page and a collection radio in the sidebar cannot disagree.
 *
 * This module holds the state and nothing else. What a filter *means* — which
 * products a size or a price band admits — is in lib/store/filters.js, shared
 * with the sidebar that has to count them.
 */

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { countActive, NO_FILTERS } from "@/lib/store/filters";

const BrowseContext = createContext(null);

/** Add or remove one value from a multi-select dimension. */
function toggle(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function BrowseProvider({ children }) {
  const [tab, setTab] = useState("new");
  const [categoryId, setCategoryId] = useState(NO_FILTERS.categoryId);
  const [fabrics, setFabrics] = useState(NO_FILTERS.fabrics);
  const [fits, setFits] = useState(NO_FILTERS.fits);
  const [sizes, setSizes] = useState(NO_FILTERS.sizes);
  const [price, setPrice] = useState(NO_FILTERS.price);
  const [inStockOnly, setInStockOnly] = useState(NO_FILTERS.inStockOnly);
  const [minRating, setMinRating] = useState(NO_FILTERS.minRating);
  const [query, setQuery] = useState(NO_FILTERS.query);

  /** Bring the shop section into view after a control changes the filter. */
  const focusShop = useCallback(() => {
    document.getElementById("shop")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  /**
   * The whole filter as one object — what lib/store/filters.js takes.
   *
   * Kept memoised because the sidebar's facet counts are memoised on it: a
   * fresh object every render would recount every option on every keystroke
   * in the search box.
   */
  const filters = useMemo(
    () => ({ categoryId, fabrics, fits, sizes, price, inStockOnly, minRating, query }),
    [categoryId, fabrics, fits, sizes, price, inStockOnly, minRating, query],
  );

  const toggleFabric = useCallback((name) => setFabrics((current) => toggle(current, name)), []);
  const toggleFit = useCallback((name) => setFits((current) => toggle(current, name)), []);
  const toggleSize = useCallback((size) => setSizes((current) => toggle(current, size)), []);

  const clearFilters = useCallback(() => {
    setCategoryId(NO_FILTERS.categoryId);
    setFabrics(NO_FILTERS.fabrics);
    setFits(NO_FILTERS.fits);
    setSizes(NO_FILTERS.sizes);
    setPrice(NO_FILTERS.price);
    setInStockOnly(NO_FILTERS.inStockOnly);
    setMinRating(NO_FILTERS.minRating);
    setQuery(NO_FILTERS.query);
  }, []);

  /**
   * Start a fresh browse inside one collection.
   *
   * Every other dimension is dropped, not kept: a shopper who taps "Anarkali
   * salwars" from the home page means to see that collection, and inheriting
   * a size and a price band left over from an earlier look would open it on a
   * near-empty grid that reads as an empty collection.
   */
  const browseCategory = useCallback(
    (id) => {
      clearFilters();
      setCategoryId(id);
      setTab("new");
      focusShop();
    },
    [clearFilters, focusShop],
  );

  const browseFabric = useCallback(
    (name) => {
      toggleFabric(name);
      focusShop();
    },
    [toggleFabric, focusShop],
  );

  /**
   * Overwrite the whole filter in one go. `/shop` calls this with the values it
   * read out of its own query string, so that page always shows what its URL
   * says — including the defaults for the keys the URL leaves out.
   */
  const applyParams = useCallback((next) => {
    const full = { ...NO_FILTERS, ...next };

    setTab(next.tab ?? "new");
    setCategoryId(full.categoryId);
    setFabrics(full.fabrics);
    setFits(full.fits);
    setSizes(full.sizes);
    setPrice(full.price);
    setInStockOnly(full.inStockOnly);
    setMinRating(full.minRating);
    setQuery(full.query);
  }, []);

  const value = useMemo(
    () => ({
      tab,
      setTab,
      filters,
      categoryId,
      setCategoryId,
      fabrics,
      toggleFabric,
      fits,
      toggleFit,
      sizes,
      toggleSize,
      price,
      setPrice,
      inStockOnly,
      setInStockOnly,
      minRating,
      setMinRating,
      query,
      setQuery,
      focusShop,
      browseCategory,
      browseFabric,
      clearFilters,
      applyParams,
      activeCount: countActive(filters),
      isFiltered: countActive(filters) > 0,
    }),
    [
      tab,
      filters,
      categoryId,
      fabrics,
      toggleFabric,
      fits,
      toggleFit,
      sizes,
      toggleSize,
      price,
      inStockOnly,
      minRating,
      query,
      focusShop,
      browseCategory,
      browseFabric,
      clearFilters,
      applyParams,
    ],
  );

  return <BrowseContext.Provider value={value}>{children}</BrowseContext.Provider>;
}

export function useBrowse() {
  const context = useContext(BrowseContext);
  if (!context) throw new Error("useBrowse must be used inside <BrowseProvider>.");
  return context;
}
