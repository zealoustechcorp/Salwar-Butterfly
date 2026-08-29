"use client";

/**
 * @file CategoryForm.js
 * @description Comprehensive Category Editor & Creation Form (F-02 Catalogue module, F-02.02 / F-02.03).
 * Organizes category management attributes across 3 tabs:
 * 1. "General Information": Name, auto-generated SEO slug, description, image upload, storefront visibility toggle.
 * 2. "Associated Products": Searchable multi-select checklist to link/unlink products to this category (F-02.04).
 * 3. "Size Charts": Fit variant selection and interactive measurement matrix editor (F-02.06).
 */

import {
  ArrowLeft,
  Check,
  Image as ImageIcon,
  Layers,
  Plus,
  Search,
  UploadCloud,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  RequirementTag,
  Textarea,
} from "@/components/admin/ui";
import { ALL_PRODUCTS } from "../../lib/categories/data";
import { FIT_TYPES } from "../../lib/categories/constants";
import { autoSlug, defaultSizeChartFor } from "../../lib/categories/utils";
import Toggle from "./Toggle";
import CategoryBadge from "./Badge";
import SizeChartEditor from "./SizeChartEditor";

/**
 * CategoryForm Component
 *
 * @param {Object} props - Component properties
 * @param {Object} [props.initial] - Existing category data if in edit mode (omitted if creating new)
 * @param {Function} props.onSave - Callback receiving processed category object on form submission
 * @param {Function} props.onCancel - Callback to exit or navigate back without saving
 * @returns {JSX.Element} The rendered multi-tab category form
 */
export default function CategoryForm({ initial, onSave, onCancel }) {
  /**
   * Category display name input state.
   */
  const [name, setName] = useState(initial?.name ?? "");

  /**
   * SEO-friendly URL slug for the category (e.g., 'anarkali-suits').
   */
  const [slug, setSlug] = useState(initial?.slug ?? "");

  /**
   * Customer-facing category description text.
   */
  const [description, setDescription] = useState(initial?.description ?? "");

  /**
   * Storefront visibility flag (true = active/published, false = draft/hidden).
   */
  const [active, setActive] = useState(initial?.active ?? true);

  /**
   * Array of product IDs currently mapped to this category.
   */
  const [selectedProductIds, setSelectedProductIds] = useState(initial?.productIds ?? []);

  /**
   * Set of active fit names (e.g., 'Slim Fit', 'Normal Fit') enabled for this category.
   */
  const [enabledFits, setEnabledFits] = useState(
    new Set(initial?.sizeCharts.map((s) => s.fit) ?? [])
  );

  /**
   * Array of configured size chart objects containing measurement matrices.
   */
  const [sizeCharts, setSizeCharts] = useState(initial?.sizeCharts ?? []);

  /**
   * Active tab identifier: 'general' | 'products' | 'sizes'.
   */
  const [activeTab, setActiveTab] = useState("general");

  /**
   * Search keyword filter for the Associated Products list.
   */
  const [productSearch, setProductSearch] = useState("");

  /**
   * Base64 data URL or remote image URL for the category banner graphic.
   */
  const [image, setImage] = useState(initial?.image ?? "");

  /**
   * Updates category name and automatically derives an updated URL slug
   * when creating a new category. For existing categories, preserves custom slugs.
   *
   * @param {string} v - New category name
   */
  const handleNameChange = (v) => {
    setName(v);
    if (!initial) setSlug(autoSlug(v));
  };

  /**
   * Reads a local graphic file from the user's computer via HTML FileReader,
   * converting it into a base64 Data URL for instant client-side preview and storage.
   *
   * @param {React.ChangeEvent<HTMLInputElement>} e - File input change event
   */
  const handleImageFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImage(ev.target?.result);
    reader.readAsDataURL(file);
  };

  /**
   * Toggles a garment fit variant on or off.
   * - If enabled: Adds fit to set and scaffolds a default size chart via `defaultSizeChartFor(fit)`.
   * - If disabled: Removes fit from set and deletes its corresponding size chart table.
   *
   * @param {string} fit - Garment fit name ("Slim Fit", "Normal Fit", "Special Dress")
   */
  const toggleFit = (fit) => {
    setEnabledFits((prev) => {
      const next = new Set(prev);
      if (next.has(fit)) {
        next.delete(fit);
        setSizeCharts((sc) => sc.filter((c) => c.fit !== fit));
      } else {
        next.add(fit);
        setSizeCharts((sc) =>
          sc.find((c) => c.fit === fit) ? sc : [...sc, defaultSizeChartFor(fit)]
        );
      }
      return next;
    });
  };

  /**
   * Toggles a product's association with this category.
   *
   * @param {string} pid - Product ID to link or unlink
   */
  const toggleProduct = (pid) => {
    setSelectedProductIds((prev) =>
      prev.includes(pid) ? prev.filter((p) => p !== pid) : [...prev, pid]
    );
  };

  /**
   * Validates form inputs and invokes the parent `onSave` handler with the complete payload.
   */
  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      ...(initial?.id ? { id: initial.id } : {}),
      name,
      slug,
      description,
      active,
      productIds: selectedProductIds,
      sizeCharts,
      image,
    });
  };

  /**
   * Tab definitions showing live count badges for associated products and enabled size charts.
   */
  const tabs = [
    { id: "general", label: "General Information" },
    { id: "products", label: `Associated Products (${selectedProductIds.length})` }
  ];

  /**
   * Filtered product items matching product title or SKU search.
   */
  const filteredProducts = ALL_PRODUCTS.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <div className="max-w-4xl space-y-6">
      {/* 
        ========================================================================
        HEADER
        Back navigation button, requirement tag, title, and description.
        ========================================================================
      */}
      <div>
        <Button variant="ghost" size="sm" onClick={onCancel} className="-ml-2 mb-2">
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold tracking-wider text-brand-600 uppercase">
            Catalogue
          </span>
          <RequirementTag id={initial ? "F-02.03" : "F-02.02"} />
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
          {initial ? `Edit Category: ${initial.name}` : "Create New Category"}
        </h1>
        <p className="mt-1 text-xs text-ink-500 sm:text-sm">
          Define category names, SEO slugs, storefront image, and size chart measurements.
        </p>
      </div>

      {/* 
        ========================================================================
        TAB NAVIGATION
        Switches between General Info, Product Linkages, and Size Charts.
        ========================================================================
      */}
      <div className="flex border-b border-ink-200">
        {tabs.map((t) => {
          const isSelected = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`relative -mb-px px-4 py-2.5 text-xs font-semibold transition-colors sm:text-sm ${isSelected
                  ? "border-b-2 border-brand-600 text-brand-700 font-bold"
                  : "text-ink-500 hover:text-ink-800"
                }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 
        ========================================================================
        TAB CONTENT PANELS
        ========================================================================
      */}
      <div>
        {/* PANEL 1: General Information */}
        {activeTab === "general" && (
          <div className="space-y-5">
            <Card className="p-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Category Name Input */}
                <Field label="Category Name" required hint="e.g. Silk Sarees, Cotton Kurtis">
                  <Input
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Enter category name"
                  />
                </Field>

                {/* SEO URL Slug */}
                <Field label="URL Slug" hint="Unique URI slug used in storefront URLs">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-ink-400">
                      /
                    </span>
                    <Input
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="e.g. silk-sarees"
                      className="pl-6 font-mono text-xs"
                    />
                  </div>
                </Field>
              </div>

              {/* Description Textarea */}
              <Field label="Description" hint="Optional summary displayed on the storefront category page">
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe this category..."
                  rows={3}
                />
              </Field>

              {/* Category Banner Image Upload Box */}
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-ink-700">
                  Category Banner Image
                </span>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="relative h-28 w-44 shrink-0 overflow-hidden rounded-lg bg-ink-100 ring-1 ring-ink-200">
                    {image ? (
                      <>
                        <img src={image} alt="Preview" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setImage("")}
                          className="absolute right-1.5 top-1.5 rounded-full bg-ink-900/60 p-1 text-white hover:bg-ink-900 transition-colors"
                          title="Remove image"
                        >
                          <X className="size-3" />
                        </button>
                      </>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-400">
                        <ImageIcon className="size-6 stroke-[1.5]" />
                        <span className="text-[10px]">No image selected</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-brand-300 bg-brand-50/30 px-4 py-2 text-xs font-medium text-brand-700 hover:bg-brand-50 transition-colors">
                      <UploadCloud className="size-4" />
                      <span>Upload image file</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFile}
                        className="hidden"
                      />
                    </label>
                    <p className="text-[11px] leading-relaxed text-ink-400">
                      Recommended: 600×400px JPG, PNG, or WebP. Appears on category listings and banners.
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Active / Inactive Storefront Visibility Card */}
            <Card className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-semibold text-ink-900">Storefront Visibility</p>
                <p className="text-xs text-ink-500">
                  {active
                    ? "Active — visible to customers on the storefront"
                    : "Inactive — hidden from store browsing and navigation"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Toggle checked={active} onChange={() => setActive(!active)} />
                <CategoryBadge active={active} />
              </div>
            </Card>
          </div>
        )}

        {/* PANEL 2: Associated Products */}
        {activeTab === "products" && (
          <Card className="p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-ink-900">Select Products</p>
              <p className="text-xs text-ink-500">
                Products checked below will be mapped to this category.
              </p>
            </div>

            {/* Product search box */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400 pointer-events-none" />
              <Input
                placeholder="Search products by title or SKU…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Scrollable list of products */}
            <div className="max-h-[380px] space-y-1.5 overflow-y-auto pr-1">
              {filteredProducts.map((p) => {
                const checked = selectedProductIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg p-2.5 transition-colors ring-1 ${checked
                        ? "bg-brand-50/50 ring-brand-300"
                        : "bg-white ring-ink-200 hover:bg-ink-50"
                      }`}
                  >
                    <Checkbox
                      checked={checked}
                      onChange={() => toggleProduct(p.id)}
                    />
                    <img
                      src={p.image}
                      alt={p.name}
                      className="size-10 rounded-md object-cover ring-1 ring-ink-200 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-ink-900">{p.name}</p>
                      <p className="font-mono text-[11px] text-ink-500">
                        {p.sku} · ${p.price} · {p.stock} in stock
                      </p>
                    </div>
                    {checked && (
                      <Badge tone="brand" className="font-medium">
                        Linked
                      </Badge>
                    )}
                  </label>
                );
              })}

              {filteredProducts.length === 0 && (
                <div className="p-8 text-center text-xs text-ink-400">
                  No products matched &quot;{productSearch}&quot;
                </div>
              )}
            </div>
          </Card>
        )}


      </div>

      {/* 
        ========================================================================
        BOTTOM ACTION FOOTER
        Save changes / Create category and Cancel actions.
        ========================================================================
      */}
      <div className="flex items-center gap-3 border-t border-ink-200 pt-4">
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!name.trim()}
          className="px-5"
        >
          <Check className="size-4" />
          {initial ? "Save changes" : "Create category"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

