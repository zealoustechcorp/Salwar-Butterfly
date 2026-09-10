"use client";

/**
 * @file StatBar.js
 * @description KPI Metrics bar for Category Management.
 * Computes and displays real-time category health metrics across the catalog:
 * 1. Total Categories & Active/Inactive breakdown.
 * 2. Active storefront categories visible to customers.
 * 3. Total unique linked products mapped across all categories.
 */

import { StatTile } from "@/components/admin/ProductBits";

/**
 * StatBar Component
 *
 * Aggregates statistics from the categories the provider loaded from the
 * API — every figure here is a count of live records.
 *
 * @param {Object} props - Component properties
 * @param {Array<Object>} props.categories - List of all category objects
 * @returns {JSX.Element} 3-column responsive KPI stats grid
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
  const totalProducts = [
    ...new Set(categories.flatMap((c) => c.productIds ?? [])),
  ].length;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {/* Total Categories Metric Card */}
      <StatTile
        label="Categories"
        value={total}
        sub={`${active} active · ${inactive} inactive`}
      />

      {/* Active Storefront Catalog Metric Card */}
      <StatTile
        label="Active catalog"
        value={active}
        sub="visible on storefront"
        tone="brand"
      />

      {/* Linked Products Count Metric Card */}
      <StatTile
        label="Linked products"
        value={totalProducts}
        sub="across all categories"
      />
    </div>
  );
}

