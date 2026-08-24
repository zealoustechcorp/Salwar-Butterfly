"use client";

/**
 * @file CategoryDetail.js
 * @description Category Detail Inspector View (F-02 Catalogue module, F-02.01).
 * Displays full deep-dive metadata and analytics for a selected category:
 * - Header with category title, SEO URL slug, description, active switch, and Edit trigger.
 * - Key metrics row: Created Date, Linked Products count, Total Stock Units, and Configured Fit Variants.
 * - Two-column dashboard layout:
 *    1. Associated Products List: Scrollable catalog cards with SKU, unit price, stock, and preview modal trigger.
 *    2. Size Charts Multi-Tab Table: Interactive tabbed view of size measurements (cm) across fit types.
 * - Product Preview Modal: Quick-view dialog displaying product images, inventory levels, and category linkage.
 */

import { ArrowLeft, Check, Layers, Package, Pencil, Ruler } from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Modal,
  RequirementTag,
} from "@/components/admin/ui";
import { StatTile } from "@/components/admin/ProductBits";
import { ALL_PRODUCTS } from "../../lib/categories/data";
import { FIT_COLORS } from "../../lib/categories/constants";
import Toggle from "./Toggle";
import CategoryBadge from "./Badge";

/**
 * CategoryDetail Component
 *
 * @param {Object} props - Component properties
 * @param {Object} props.category - The category object being viewed
 * @param {Function} props.onEdit - Handler to navigate to category edit screen
 * @param {Function} props.onBack - Handler to navigate back to categories list
 * @param {Function} props.onToggle - Handler to flip category active/inactive status
 * @returns {JSX.Element} The rendered category detail screen
 */
export default function CategoryDetail({ category, onEdit, onBack, onToggle }) {
  /**
   * Active index for the size charts fit tab selector (e.g. 0 = Slim Fit, 1 = Normal Fit).
   */
  const [chartTab, setChartTab] = useState(0);

  /**
   * Product object selected for modal dialog preview, or null if modal is closed.
   */
  const [selectedProduct, setSelectedProduct] = useState(null);

  /**
   * Resolves full product objects from `ALL_PRODUCTS` whose IDs match `category.productIds`.
   */
  const products = ALL_PRODUCTS.filter((p) => category.productIds.includes(p.id));

  /**
   * Currently active size chart matrix based on selected tab index.
   */
  const chart = category.sizeCharts[chartTab];

  /**
   * Sum of all physical stock units across products linked to this category.
   */
  const totalStock = products.reduce((s, p) => s + p.stock, 0);

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
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold tracking-wider text-brand-600 uppercase">
                Category Detail
              </span>
              <RequirementTag id="F-02.01" />
            </div>
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
        High-level metrics: Created Date, Product Count, Total Stock, Fit Variants.
        ========================================================================
      */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Created Date"
          value={category.createdAt || "—"}
          sub="record initialized"
          requirement="F-02.01"
        />
        <StatTile
          label="Linked Products"
          value={products.length}
          sub="items categorized"
          requirement="F-02.04"
        />
        <StatTile
          label="Total Stock"
          value={totalStock.toLocaleString()}
          sub="units across variants"
          tone="brand"
          requirement="F-02.06"
        />
        <StatTile
          label="Fit Variants"
          value={category.sizeCharts.length}
          sub="configured size charts"
          requirement="F-02.06"
        />
      </div>

      {/* 
        ========================================================================
        TWO COLUMN CONTENT DASHBOARD:
        Left: Associated Products List | Right: Fit Size Chart Tabular Viewer
        ========================================================================
      */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* COLUMN 1: Associated Products */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader
            title="Associated Products"
            description="Products linked to this category in the catalog."
            requirement="F-02.04"
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
                  <img
                    src={p.image}
                    alt={p.name}
                    className="size-11 rounded-lg object-cover ring-1 ring-ink-200/80 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{p.name}</p>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-ink-500">
                      <span>{p.sku}</span>
                      <span>·</span>
                      <span className="font-semibold text-ink-800">${p.price}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-xs font-medium text-ink-700">
                      {p.stock} units
                    </span>
                    <p className="text-[10px] text-ink-400">on hand</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* COLUMN 2: Size Charts by Fit Variant */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader
            title="Size Charts"
            description="Measurements in centimetres by fit variant."
            requirement="F-02.06"
          />

          {category.sizeCharts.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-ink-400">
              <Ruler className="size-8 stroke-[1.5] text-ink-300" />
              <p className="mt-2 text-xs font-medium text-ink-600">No size charts configured</p>
              <p className="text-[11px] text-ink-400">
                Edit this category to configure size measurements.
              </p>
            </div>
          ) : (
            <div>
              {/* Fit Tabs Selector: Slim Fit / Normal Fit / Special Dress */}
              <div className="flex border-b border-ink-200 bg-ink-50/50 px-3 pt-2">
                {category.sizeCharts.map((sc, idx) => {
                  const isSelected = chartTab === idx;
                  return (
                    <button
                      key={sc.fit}
                      type="button"
                      onClick={() => setChartTab(idx)}
                      className={`relative -mb-px px-4 py-2 text-xs font-semibold transition-colors ${isSelected
                          ? "border-b-2 border-brand-600 text-brand-700 font-bold bg-white rounded-t-lg"
                          : "text-ink-500 hover:text-ink-800"
                        }`}
                    >
                      {sc.fit}
                    </button>
                  );
                })}
              </div>

              {/* Measurement Matrix Table */}
              {chart && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-ink-200 bg-ink-50/30">
                        {["Size", "Chest", "Waist", "Hip", "Length"].map((h) => (
                          <th
                            key={h}
                            className="px-4 py-2.5 font-mono text-[11px] font-semibold tracking-wider text-ink-600 uppercase"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {chart.rows.map((row, i) => (
                        <tr key={i} className="hover:bg-ink-50/40 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-xs font-bold text-brand-700">
                            {row.size}
                          </td>
                          {["chest", "waist", "hip", "length"].map((k) => (
                            <td
                              key={k}
                              className="px-4 py-2.5 font-mono text-xs text-ink-800"
                            >
                              {row[k] || "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
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
        description={selectedProduct?.sku ? `SKU: ${selectedProduct.sku}` : ""}
        requirement="F-03.01"
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
            {/* Product Image */}
            {selectedProduct.image ? (
              <div className="relative h-56 w-full overflow-hidden rounded-lg bg-ink-100 ring-1 ring-ink-200/80">
                <img
                  src={selectedProduct.image.replace("w=80&h=80", "w=600&h=400")}
                  alt={selectedProduct.name}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}

            {/* Product stats: Price, Stock, In-Stock Badge */}
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-lg bg-ink-50 p-2.5 ring-1 ring-ink-200/60">
                <p className="text-[11px] text-ink-500 font-medium">Price</p>
                <p className="mt-0.5 font-mono text-base font-semibold text-ink-900">
                  ${selectedProduct.price}
                </p>
              </div>
              <div className="border-x border-ink-200/60 rounded-lg bg-ink-50 p-2.5 ring-1 ring-ink-200/60">
                <p className="text-[11px] text-ink-500 font-medium">Stock</p>
                <p className="mt-0.5 font-mono text-base font-semibold text-ink-900">
                  {selectedProduct.stock}
                </p>
              </div>
              <div className="rounded-lg bg-ink-50 p-2.5 ring-1 ring-ink-200/60">
                <p className="text-[11px] text-ink-500 font-medium">Status</p>
                <p className="mt-0.5 text-xs font-semibold">
                  <Badge tone={selectedProduct.stock > 0 ? "green" : "red"}>
                    {selectedProduct.stock > 0 ? "In Stock" : "Out"}
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

