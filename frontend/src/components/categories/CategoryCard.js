"use client";

/**
 * @file CategoryCard.js
 * @description Category Display Card Component (F-02 Catalogue module).
 * Renders an individual category card in the admin category grid, featuring:
 * - Category banner image with hover zoom effect.
 * - Floating active/inactive status toggle and badge.
 * - Garment fit badges (Slim Fit, Normal Fit, Special Dress).
 * - Name, SEO slug, and description text.
 * - Mini metrics summary (Product count, aggregated inventory stock, size charts count).
 * - "View" (detail) and "Edit" action buttons.
 */

import { Eye, Layers, Pencil } from "lucide-react";
import Image from "next/image";
import { Badge, Button } from "@/components/admin/ui";
import { ALL_PRODUCTS } from "../../lib/categories/data";
import Toggle from "./Toggle";
import CategoryBadge from "./Badge";

/**
 * CategoryCard Component
 *
 * @param {Object} props - Component properties
 * @param {Object} props.cat - Category object containing details (id, name, slug, description, image, active, productIds, sizeCharts)
 * @param {Function} props.onEdit - Callback function invoked to navigate to category edit screen
 * @param {Function} props.onDetail - Callback function invoked to navigate to category detail screen
 * @param {Function} props.onToggle - Callback function invoked when the active/inactive toggle is flipped
 * @returns {JSX.Element} The rendered category card component
 */
export default function CategoryCard({ cat, onEdit, onDetail, onToggle }) {
  /**
   * Calculates total inventory units on hand for this specific category
   * by summing stock quantities of all products whose IDs are listed in `cat.productIds`.
   */
  const totalStock = ALL_PRODUCTS.filter((p) => cat.productIds.includes(p.id)).reduce(
    (s, p) => s + p.stock,
    0
  );

  return (
    <div className="group relative flex flex-col rounded-xl bg-white ring-1 ring-ink-200/80 shadow-xs hover:ring-brand-300 hover:shadow-md transition-all duration-150 overflow-hidden">
      {/* 
        ========================================================================
        IMAGE HEADER SECTION
        Displays category banner graphic or fallback icon, overlaid with
        the active toggle (top-right) and fit variant chips (bottom-left).
        ========================================================================
      */}
      <div className="relative h-44 w-full overflow-hidden bg-ink-100">
        {cat.image ? (
          <img
            src={cat.image}
            alt={cat.name}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
          />
        ) : (
          /* Fallback placeholder when no category banner image exists */
          <div className="flex h-full w-full items-center justify-center bg-brand-50 text-brand-300">
            <Layers className="size-10" />
          </div>
        )}

        {/* Subtle dark gradient overlay for enhanced text/badge legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/60 via-transparent to-transparent pointer-events-none" />

        {/* 
          Top Floating Controls:
          Allows admin to flip category visibility immediately without opening edit mode.
        */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 shadow-sm backdrop-blur-xs ring-1 ring-black/5">
          <Toggle checked={cat.active} onChange={() => onToggle(cat.id)} size="sm" />
          <CategoryBadge active={cat.active} />
        </div>

        {/* 
          Bottom Floating Fit Variant Badges:
          Displays which size charts (e.g. Slim Fit, Normal Fit, Special) are configured.
        */}
        <div className="absolute bottom-2.5 left-2.5 flex flex-wrap gap-1">
          {cat.sizeCharts.map((sc) => (
            <span
              key={sc.fit}
              className="rounded bg-white/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand-800 shadow-xs backdrop-blur-xs ring-1 ring-brand-200/50"
            >
              {sc.fit === "Slim Fit" ? "Slim Fit" : sc.fit === "Normal Fit" ? "Normal Fit" : "Special"}
            </span>
          ))}
        </div>
      </div>

      {/* 
        ========================================================================
        CARD CONTENT BODY
        Contains title, SEO slug, description, stock overview, and action buttons.
        ========================================================================
      */}
      <div className="flex flex-1 flex-col p-4">
        {/* Category Name & URL Slug */}
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <h3
              onClick={() => onDetail(cat)}
              className="cursor-pointer font-semibold text-ink-900 group-hover:text-brand-700 transition-colors line-clamp-1"
            >
              {cat.name}
            </h3>
          </div>
          <p className="font-mono text-[11px] text-ink-400">/{cat.slug}</p>
        </div>

        {/* Category Description */}
        <p className="mt-2 text-xs leading-relaxed text-ink-500 line-clamp-2 min-h-[2rem]">
          {cat.description || "No description provided."}
        </p>

        {/* 
          Mini Metrics Grid:
          Shows Linked Products count, Total Available Stock, and Active Size Charts count.
        */}
        <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-lg bg-ink-50/70 p-2 ring-1 ring-ink-200/60 text-center">
          <div>
            <p className="font-mono text-xs font-semibold text-ink-900">{cat.productIds.length}</p>
            <p className="text-[10px] text-ink-500">Products</p>
          </div>
          <div className="border-x border-ink-200/60">
            <p className="font-mono text-xs font-semibold text-ink-900">{totalStock}</p>
            <p className="text-[10px] text-ink-500">Stock</p>
          </div>
          <div>
            <p className="font-mono text-xs font-semibold text-ink-900">{cat.sizeCharts.length}</p>
            <p className="text-[10px] text-ink-500">Charts</p>
          </div>
        </div>

        {/* 
          Action Buttons:
          - "View": Opens the comprehensive Category Detail screen.
          - "Edit": Opens the multi-tab Category Form editor.
        */}
        <div className="mt-4 flex items-center gap-2 pt-2 border-t border-ink-100">
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => onDetail(cat)}
          >
            <Eye className="size-3.5" />
            View
          </Button>
          <Button
            size="sm"
            variant="primary"
            className="flex-1"
            onClick={() => onEdit(cat)}
          >
            <Pencil className="size-3.5" />
            Edit
          </Button>
        </div>
      </div>
    </div>
  );
}

