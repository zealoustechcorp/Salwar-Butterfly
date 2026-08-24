"use client";

/**
 * @file StatBar.js
 * @description KPI Metrics bar for Category Management (F-02 Catalogue module).
 * Computes and displays real-time category health metrics across the catalog:
 * 1. Total Categories & Active/Inactive breakdown (F-02.01).
 * 2. Active storefront categories visible to customers (F-02.03).
 * 3. Total unique linked products mapped across all categories (F-02.04).
 * 4. Total physical inventory on hand in categorized garments (F-02.06).
 */

import { StatTile } from "@/components/admin/ProductBits";
import { ALL_PRODUCTS } from "../../lib/categories/data";

/**
 * StatBar Component
 *
 * Aggregates statistics dynamically from the current categories state array and
 * the product catalog dataset to provide an executive summary overview.
 *
 * @param {Object} props - Component properties
 * @param {Array<Object>} props.categories - List of all category objects
 * @returns {JSX.Element} 4-column responsive KPI stats grid
 */
export default function StatBar({ categories }) {
  /**
   * Total number of category records in the catalog.
   */
  const total = categories.length;

  /**
   * Count of categories currently published and visible on the customer storefront.
   */
  const active = categories.filter((c) => c.active).length;

  /**
   * Count of categories hidden or in draft mode.
   */
  const inactive = total - active;

  /**
   * Count of unique product IDs assigned across all active and inactive categories.
   * Uses a Set to deduplicate in case a product is assigned to multiple categories.
   */
  const totalProducts = [...new Set(categories.flatMap((c) => c.productIds))].length;

  /**
   * Total aggregated inventory stock (sum of all units on hand) for products
   * belonging to any registered category in the system.
   */
  const totalStock = ALL_PRODUCTS.filter((p) =>
    categories.some((c) => c.productIds.includes(p.id))
  ).reduce((s, p) => s + p.stock, 0);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {/* Total Categories Metric Card (F-02.01) */}
      <StatTile
        label="Categories"
        value={total}
        sub={`${active} active · ${inactive} inactive`}
        requirement="F-02.01"
      />

      {/* Active Storefront Catalog Metric Card (F-02.03) */}
      <StatTile
        label="Active catalog"
        value={active}
        sub="visible on storefront"
        tone="brand"
        requirement="F-02.03"
      />

      {/* Linked Products Count Metric Card (F-02.04) */}
      <StatTile
        label="Linked products"
        value={totalProducts}
        sub="across all categories"
        requirement="F-02.04"
      />

      {/* Categorized Stock On Hand Metric Card (F-02.06) */}
      <StatTile
        label="Inventory on hand"
        value={totalStock.toLocaleString()}
        sub="units in categorized items"
        requirement="F-02.06"
      />
    </div>
  );
}

