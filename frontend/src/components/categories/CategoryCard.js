"use client";

/**
 * @file CategoryCard.js
 * @description Category Display Card Component.
 * Renders an individual category card in the admin category grid, featuring:
 * - Category banner image with hover zoom effect.
 * - Floating active/inactive status toggle and badge.
 * - Name, SEO slug, and description text.
 * - Mini metrics summary (linked product count).
 * - "View" (detail) and "Edit" action buttons.
 */

import { Eye, Layers, Pencil } from "lucide-react";
import { Button } from "@/components/admin/ui";
import Toggle from "./Toggle";
import CategoryBadge from "./Badge";

/**
 * CategoryCard Component
 *
 * @param {Object} props - Component properties
 * @param {Object} props.cat - Category object containing details (id, name, slug, description, image, active, productIds)
 * @param {Function} props.onEdit - Callback function invoked to navigate to category edit screen
 * @param {Function} props.onDetail - Callback function invoked to navigate to category detail screen
 * @param {Function} props.onToggle - Callback function invoked when the active/inactive toggle is flipped
 * @returns {JSX.Element} The rendered category card component
 */
export default function CategoryCard({ cat, onEdit, onDetail, onToggle }) {
  /** Derived on the provider from `products.category_id`. */
  const productCount = cat.productIds?.length ?? 0;

  return (
    <div className="group relative flex flex-col rounded-xl bg-white ring-1 ring-ink-200/80 shadow-xs hover:ring-brand-300 hover:shadow-md transition-all duration-150 overflow-hidden">
      {/* 
        ========================================================================
        IMAGE HEADER SECTION
        Displays category banner graphic or fallback icon, overlaid with
        the active toggle (top-right).
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

        {/* Mini Metrics: linked product count. */}
        <div className="mt-3 rounded-lg bg-ink-50/70 p-2 ring-1 ring-ink-200/60 text-center">
          <p className="font-mono text-xs font-semibold text-ink-900">{productCount}</p>
          <p className="text-[10px] text-ink-500">Products</p>
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

