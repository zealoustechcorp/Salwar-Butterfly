"use client";

/**
 * Shared browse state for the home page.
 *
 * The header search, the category tiles and the fabric chips all steer the same
 * shop section further down the page, so the filter lives above them rather
 * than inside the grid. This is what keeps every control on the page real: with
 * no category or product routes built yet, "Anarkali Suits" filters the grid
 * and scrolls to it instead of pointing at a link that goes nowhere.
 */

import { createContext, useCallback, useContext, useMemo, useState } from "react";

const BrowseContext = createContext(null);

/**
 * Every tab sorts on something the snapshot actually records. There is no
 * "bestsellers" rail: the live shop publishes no sales figures, so ranking by
 * popularity would be invented.
 */
export const TABS = [
  { id: "new", label: "New In" },
  { id: "offers", label: "On Offer" },
  { id: "lowest", label: "Lowest Price" },
  { id: "almost-gone", label: "Almost Gone" },
];

export function BrowseProvider({ children }) {
  const [tab, setTab] = useState("new");
  const [categoryId, setCategoryId] = useState("all");
  const [fabric, setFabric] = useState("all");
  const [query, setQuery] = useState("");

  /** Bring the shop section into view after a control changes the filter. */
  const focusShop = useCallback(() => {
    document.getElementById("shop")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const browseCategory = useCallback(
    (id) => {
      setCategoryId(id);
      setFabric("all");
      setTab("new");
      focusShop();
    },
    [focusShop],
  );

  const browseFabric = useCallback(
    (name) => {
      setFabric((current) => (current === name ? "all" : name));
      focusShop();
    },
    [focusShop],
  );

  const clearFilters = useCallback(() => {
    setCategoryId("all");
    setFabric("all");
    setQuery("");
  }, []);

  /**
   * Overwrite the whole filter in one go. `/shop` calls this with the values it
   * read out of its own query string, so that page always shows what its URL
   * says — including the defaults for the keys the URL leaves out.
   */
  const applyParams = useCallback(({ tab: nextTab, categoryId: nextCategory, fabric: nextFabric, query: nextQuery }) => {
    setTab(nextTab);
    setCategoryId(nextCategory);
    setFabric(nextFabric);
    setQuery(nextQuery);
  }, []);

  const value = useMemo(
    () => ({
      tab,
      setTab,
      categoryId,
      setCategoryId,
      fabric,
      setFabric,
      query,
      setQuery,
      focusShop,
      browseCategory,
      browseFabric,
      clearFilters,
      applyParams,
      isFiltered: categoryId !== "all" || fabric !== "all" || query.trim() !== "",
    }),
    [tab, categoryId, fabric, query, focusShop, browseCategory, browseFabric, clearFilters, applyParams],
  );

  return <BrowseContext.Provider value={value}>{children}</BrowseContext.Provider>;
}

export function useBrowse() {
  const context = useContext(BrowseContext);
  if (!context) throw new Error("useBrowse must be used inside <BrowseProvider>.");
  return context;
}
