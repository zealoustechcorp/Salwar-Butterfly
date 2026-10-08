"use client";

/**
 * @file CategoryDetail.js
 * @description Category Detail Inspector View.
 * Displays full deep-dive metadata and analytics for a selected category:
 * - Header with category title, SEO URL slug, description, active switch, and Edit trigger.
 * - Key metrics row: Created Date, Linked Products count, and Live Products.
 * - Associated Products List: Scrollable catalog cards with slug, current price, and preview modal trigger.
 * - Product Preview Modal: Quick-view dialog displaying pricing, publication state, and category linkage.
 *
 * Size charts are not shown here — they are shop-wide rather than per
 * category and live on /admin/size-charts.
 */

import { ArrowLeft, Check, Package, Pencil } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, Modal } from "@/components/admin/ui";
import { StatGrid, StatTile } from "@/components/admin/ProductBits";
import { money, shortDate } from "@/lib/format";
import Toggle from "./Toggle";
import CategoryBadge from "./Badge";

/**
 * CategoryDetail Component
 *
 * @param {Object} props - Component properties
 * @param {Object} props.category - The category object being viewed
 * @param {Array<Object>} props.products - Products the API reports in this category
 * @param {Function} props.onEdit - Handler to navigate to category edit screen
 * @param {Function} props.onBack - Handler to navigate back to categories list
 * @param {Function} props.onToggle - Handler to flip category active/inactive status
 * @returns {JSX.Element} The rendered category detail screen
 */
export default function CategoryDetail({
  category,
  products = [],
  onEdit,
  onBack,
  onToggle,
}) {
  /**
   * Product object selected for modal dialog preview, or null if modal is closed.
   */
  const [selectedProduct, setSelectedProduct] = useState(null);

  /**
   * Products in this category that are published to the storefront.
   */
  const liveProducts = products.filter((p) => p.active).length;

  return (
    <div className="max-w-5xl space-y-6">
      {/* 
        ========================================================================
        TOP HEADER SECTION
        Back navigation, module title, slug, active toggle, and edit button.
        ========================================================================
      */}
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="size-4" />
          Back to categories
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="font-mono text-xs font-semibold tracking-wider text-brand-600 uppercase">
              Category Detail
            </span>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
              {category.name}
            </h1>
            <p className="mt-0.5 font-mono text-xs text-ink-400">/{category.slug}</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick visibility toggle container */}
            <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 ring-1 ring-ink-200/80 shadow-xs">
              <Toggle checked={category.active} onChange={onToggle} size="sm" />
              <CategoryBadge active={category.active} />
            </div>

            {/* Primary edit action button */}
            <Button variant="primary" onClick={onEdit}>
              <Pencil className="size-3.5" />
              Edit category
            </Button>
          </div>
        </div>

        {/* Optional Category Description text */}
        {category.description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-ink-600">
            {category.description}
          </p>
        ) : null}
      </div>

      {/* 
        ========================================================================
        KEY PERFORMANCE METRICS (KPI ROW)
        High-level metrics: Created Date, Product Count, Live Products.
        ========================================================================
      */}
      <StatGrid cols={3}>
        <StatTile
          label="Created Date"
          value={shortDate(category.createdAt)}
          sub="record initialized"
        />
        <StatTile
          label="Linked Products"
          value={products.length}
          sub="items categorized"
        />
        <StatTile
          label="Live Products"
          value={liveProducts}
          sub="published to storefront"
          tone="brand"
        />
      </StatGrid>

      {/*
        ========================================================================
        ASSOCIATED PRODUCTS
        ========================================================================
      */}
      <div>
        <Card className="flex flex-col overflow-hidden">
          <CardHeader
            title="Associated Products"
            description="Products linked to this category in the catalog."
            actions={
              <Badge tone="brand">
                {products.length} {products.length === 1 ? "product" : "products"}
              </Badge>
            }
          />

          <div className="flex-1 overflow-y-auto max-h-[420px] divide-y divide-ink-100">
            {products.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-ink-400">
                <Package className="size-8 stroke-[1.5] text-ink-300" />
                <p className="mt-2 text-xs font-medium text-ink-600">No products linked yet</p>
                <p className="text-[11px] text-ink-400">
                  Edit this category to associate products.
                </p>
              </div>
            ) : (
              products.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  className="flex cursor-pointer items-center gap-3 p-3.5 transition-colors hover:bg-brand-50/40"
                  title="Click to preview product details"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{p.name}</p>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-ink-500">
                      <span className="truncate">/{p.slug}</span>
                      <span>·</span>
                      <span className="font-semibold text-ink-800">
                        {money(p.currentPrice)}
                      </span>
                    </div>
                  </div>
                  <Badge tone={p.active ? "green" : "slate"}>
                    {p.active ? "Live" : "Hidden"}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* 
        ========================================================================
        PRODUCT DETAIL MODAL PREVIEW
        Opened when an administrator clicks a product in the associated list.
        ========================================================================
      */}
      <Modal
        open={Boolean(selectedProduct)}
        onClose={() => setSelectedProduct(null)}
        title={selectedProduct?.name || "Product preview"}
        description={selectedProduct?.slug ? `/${selectedProduct.slug}` : ""}
        size="md"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setSelectedProduct(null)}>
              Close
            </Button>
          </div>
        }
      >
        {selectedProduct ? (
          <div className="p-5 space-y-4">
            {/* Product stats: Price, Discount, Publication status */}
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-lg bg-ink-50 p-2.5 ring-1 ring-ink-200/60">
                <p className="text-[11px] text-ink-500 font-medium">Price</p>
                <p className="mt-0.5 font-mono text-base font-semibold text-ink-900">
                  {money(selectedProduct.currentPrice)}
                </p>
              </div>
              <div className="rounded-lg bg-ink-50 p-2.5 ring-1 ring-ink-200/60">
                <p className="text-[11px] text-ink-500 font-medium">Discount</p>
                <p className="mt-0.5 font-mono text-base font-semibold text-ink-900">
                  {selectedProduct.discountPercentage}%
                </p>
              </div>
              <div className="rounded-lg bg-ink-50 p-2.5 ring-1 ring-ink-200/60">
                <p className="text-[11px] text-ink-500 font-medium">Status</p>
                <p className="mt-0.5 text-xs font-semibold">
                  <Badge tone={selectedProduct.active ? "green" : "slate"}>
                    {selectedProduct.active ? "Live" : "Hidden"}
                  </Badge>
                </p>
              </div>
            </div>

            {/* Category confirmation message */}
            <div className="flex items-center gap-2 rounded-lg bg-brand-50 p-3 text-xs text-brand-800 ring-1 ring-brand-200/60">
              <Check className="size-4 shrink-0 text-brand-600" />
              <span>
                Assigned to category <strong>{category.name}</strong>
              </span>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

