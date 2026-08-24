"use client";

/**
 * @file context.js
 * @description React Context and state provider for Category Management (F-02 Catalogue module).
 * Maintains category collection state across the entire /admin/category route tree so that
 * any edits, creation of new categories, or active/inactive status toggles remain synchronized
 * during client-side navigation between List, Detail, Edit, and Creation screens.
 */

import { createContext, useContext, useState } from "react";
import { INITIAL_CATEGORIES, DEFAULT_CATEGORY_IMAGE } from "./data";

/**
 * React Context instance for categories.
 * Initialized with null fallback; consumed exclusively via the `useCategories` custom hook.
 */
const CategoryContext = createContext(null);

/**
 * CategoryProvider Component
 * 
 * Wraps the `/admin/category` layout tree to deliver shared state and mutation methods
 * to all child components and pages.
 *
 * State provided to consumers:
 * - `categories`: Array of category objects currently in memory.
 * - `toggleActive(id)`: Function to flip a category's active/inactive visibility.
 * - `saveCategory(data)`: Function to update an existing category or create a new one.
 *
 * @param {Object} props - Component props containing child elements
 * @param {React.ReactNode} props.children - Child routes/components rendered within this provider
 * @returns {JSX.Element} Context provider wrapping children
 */
export function CategoryProvider({ children }) {
  /**
   * Main state storing the full list of categories.
   * Initialized with `INITIAL_CATEGORIES` (seeded dataset reflecting F-02 requirements).
   */
  const [categories, setCategories] = useState(INITIAL_CATEGORIES);

  /**
   * Toggles the storefront visibility status of a category (`active` boolean).
   * When `active` is true, the category is visible to storefront shoppers.
   * When `active` is false, it is hidden from storefront navigation and catalog browsing.
   *
   * @param {string|number} id - Unique identifier of the category to toggle
   */
  const toggleActive = (id) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, active: !c.active } : c))
    );
  };

  /**
   * Handles both update (edit) and insert (create) operations for categories.
   * 
   * - If `data.id` is present: Updates matching category fields in the existing array.
   * - If `data.id` is omitted: Generates a unique timestamp-based ID (`cat<timestamp>`),
   *   sets the creation date, initializes product count to 0, assigns a fallback banner image
   *   if none was uploaded, and appends the new record to state.
   *
   * @param {Object} data - Category data payload (name, slug, description, image, sizeCharts, productIds, active)
   */
  const saveCategory = (data) => {
    if (data.id) {
      // Update existing category record
      setCategories((prev) =>
        prev.map((c) => (c.id === data.id ? { ...c, ...data } : c))
      );
    } else {
      // Create and append a brand-new category record
      const newCat = {
        ...data,
        id: "cat" + Date.now(), // Generate unique client identifier
        createdAt: new Date().toISOString().split("T")[0], // ISO date format YYYY-MM-DD
        itemCount: 0, // Initial item counter
        image: data.image || DEFAULT_CATEGORY_IMAGE, // Fallback to default lifestyle image
      };
      setCategories((prev) => [...prev, newCat]);
    }
  };

  return (
    <CategoryContext.Provider value={{ categories, toggleActive, saveCategory }}>
      {children}
    </CategoryContext.Provider>
  );
}

/**
 * Custom React Hook to consume the CategoryContext.
 * Ensures the hook is only invoked within a valid `<CategoryProvider>` subtree.
 *
 * @throws {Error} If called outside of CategoryProvider
 * @returns {{ categories: Array, toggleActive: Function, saveCategory: Function }}
 */
export function useCategories() {
  const ctx = useContext(CategoryContext);
  if (!ctx) {
    throw new Error("useCategories must be used within a CategoryProvider");
  }
  return ctx;
}

