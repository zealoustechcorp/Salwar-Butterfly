"use client";

/**
 * @file CategoryList.js
 * @description Master Category Directory View.
 * Presents the administrative catalog management interface with:
 * - Module title header and "+ Add category" primary action.
 * - Real-time KPI stat bar summarizing category counts and inventory.
 * - Live instant search (matching category name, slug, or description).
 * - Segmented status filter pills ("All", "Active", "Inactive").
 * - Responsive card grid rendering individual CategoryCard components.
 * - Interactive Empty State handling for zero search results and empty catalog.
 */

import { FolderPlus, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { Button, EmptyState, Input } from "@/components/admin/ui";
import CategoryCard from "./CategoryCard";
import StatBar from "./StatBar";

/**
 * CategoryList Component
 *
 * @param {Object} props - Component properties
 * @param {Array<Object>} props.categories - List of all category objects
 * @param {Function} props.onAdd - Handler to navigate to category creation page
 * @param {Function} props.onEdit - Handler to navigate to category edit page
 * @param {Function} props.onDetail - Handler to navigate to category detail page
 * @param {Function} props.onToggle - Handler to flip category active/inactive status
 * @returns {JSX.Element} The rendered category list and management dashboard
 */
export default function CategoryList({ categories, onAdd, onEdit, onDetail, onToggle }) {
  /**
   * Search query state for real-time text matching across name, slug, and description.
   */
  const [search, setSearch] = useState("");

  /**
   * Filter state for active status:
   * - "all": Displays all categories regardless of publication state.
   * - "active": Displays only storefront-visible categories (`c.active === true`).
   * - "inactive": Displays only hidden/draft categories (`c.active === false`).
   */
  const [filter, setFilter] = useState("all");

  /**
   * Derived collection of categories matching both the active text search query
   * and the chosen publication status filter.
   */
  const filtered = categories.filter((c) => {
    // Check if category name, URL slug, or description matches search string
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.slug.toLowerCase().includes(search.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(search.toLowerCase()));

    // Check if active state matches current filter selection
    const matchFilter = filter === "all" || (filter === "active" ? c.active : !c.active);

    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-5">
      {/*
        ========================================================================
        HEADER SECTION
        Module title and primary action.
        ========================================================================
      */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="font-mono text-xs font-semibold tracking-wider text-brand-600 uppercase">
            Catalogue
          </span>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
            Categories
          </h1>
          <p className="mt-1 text-xs text-ink-500 sm:text-sm">
            Organize products, manage taxonomy slugs, and configure size chart matrices.
          </p>
        </div>

        {/* Primary CTA button to create a new category */}
        <Button variant="primary" onClick={onAdd} className="shrink-0">
          <Plus className="size-4" />
          Add category
        </Button>
      </div>

      {/* 
        ========================================================================
        METRICS & STATS BAR
        Displays high-level KPIs (Total, Active, Products, Stock).
        ========================================================================
      */}
      <StatBar categories={categories} />

      {/* 
        ========================================================================
        SEARCH & FILTER TOOLBAR
        Instant search text input and segmented status toggle buttons.
        ========================================================================
      */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Real-time search input with clear (X) button */}
        <div className="relative flex-1 max-w-md">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400 pointer-events-none"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories by name, slug, or description…"
            className="pl-9 pr-8"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-400 hover:text-ink-600"
              title="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        {/* Segmented Filter Pills: All | Active | Inactive */}
        <div className="flex items-center gap-1.5 rounded-lg bg-white p-1 ring-1 ring-ink-200/80 shadow-xs">
          {[
            { id: "all", label: "All" },
            { id: "active", label: "Active" },
            { id: "inactive", label: "Inactive" },
          ].map((f) => {
            const isSelected = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  isSelected
                    ? "bg-brand-600 text-white shadow-xs"
                    : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 
        ========================================================================
        CATEGORY GRID & EMPTY STATES
        Renders cards if items exist, or provides helpful recovery actions if empty.
        ========================================================================
      */}
      {filtered.length === 0 ? (
        /* Empty State shown when no categories match search/filters */
        <div className="rounded-xl bg-white ring-1 ring-ink-200/80 shadow-xs">
          <EmptyState
            title="No categories found"
            description={
              search || filter !== "all"
                ? "Try adjusting your search query or filter criteria."
                : "Get started by creating your first product category."
            }
            icon={<FolderPlus className="size-6 text-brand-600" />}
            action={
              search || filter !== "all" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                >
                  Reset filters
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={onAdd}>
                  <Plus className="size-4" />
                  Add category
                </Button>
              )
            }
          />
        </div>
      ) : (
        /* Responsive Card Grid (1 col on mobile, up to 4 cols on XL screens) */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((cat) => (
            <CategoryCard
              key={cat.id}
              cat={cat}
              onEdit={onEdit}
              onDetail={onDetail}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

