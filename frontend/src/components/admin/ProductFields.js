"use client";

import { money } from "@/lib/format";
import { slugify } from "@/lib/mock/store";
import { FIT_TYPES } from "@/lib/mock/seed";
import { Badge, Field, Input, RequirementTag, Select, Textarea, Toggle } from "./ui";

/** F-03.02 / F-03.05 / F-03.07 — identity, description and category assignment. */
export function DetailsFields({ form, setField, errors = {}, reference }) {
  const categories = reference?.categories || [];
  const charts = reference?.sizeCharts || [];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field
        label="Product name"
        required
        className="md:col-span-2"
        error={errors.name}
        hint="Shown on the storefront and used for search. Up to 200 characters."
      >
        <Input
          value={form.name}
          invalid={Boolean(errors.name)}
          onChange={(e) => setField("name", e.target.value)}
          placeholder="e.g. Rani Pink Chanderi Anarkali"
          maxLength={200}
        />
      </Field>

      <Field
        label="URL slug"
        className="md:col-span-2"
        error={errors.slug}
        hint="Derived from the name. Must be unique across the catalogue."
      >
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-xs text-ink-400">salwarbutterfly.com/product/</span>
          <Input
            value={form.slug}
            invalid={Boolean(errors.slug)}
            onChange={(e) => setField("slug", slugify(e.target.value))}
            placeholder={slugify(form.name) || "product-slug"}
            className="font-mono text-xs"
          />
        </div>
      </Field>

      <Field
        label="Description"
        className="md:col-span-2"
        hint="Fabric, fit, care and what is included. Also feeds storefront search."
      >
        <Textarea
          value={form.description}
          onChange={(e) => setField("description", e.target.value)}
          placeholder="Floor-length Chanderi silk Anarkali with zari border…"
        />
      </Field>

      {/* 
        ========================================================================
        CATEGORY ASSIGNMENT FIELD (F-03.07 / F-02 Integration)
        - Enforces strict one-category-per-product taxonomy rule.
        - Populates options from the Category Management module.
        - Disables inactive categories to prevent assigning hidden classifications.
        - Auto-configures default_size_chart_id from category defaults when selected.
        ========================================================================
      */}
      <Field label="Category" required error={errors.category_id} hint="F-03.07 — one category per product.">
        <Select
          value={form.category_id}
          invalid={Boolean(errors.category_id)}
          onChange={(e) => {
            setField("category_id", e.target.value);
            // Look up selected category to auto-populate default size chart if unset
            const category = categories.find((c) => String(c.id) === String(e.target.value));
            if (category?.default_size_chart_id && !form.size_chart_id)
              setField("size_chart_id", String(category.default_size_chart_id));
          }}
        >
          <option value="">Select a category…</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id} disabled={!category.is_active}>
              {category.name}
              {category.is_active ? "" : " — inactive"}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Fit" hint="Decides which size chart the storefront shows (F-02.06).">
        <Select value={form.fit} onChange={(e) => setField("fit", e.target.value)}>
          <option value="">No fit specified</option>
          {FIT_TYPES.map((fit) => (
            <option key={fit.value} value={fit.value}>
              {fit.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Size chart" hint="Defaults to the category's chart; override per product if needed.">
        <Select value={form.size_chart_id} onChange={(e) => setField("size_chart_id", e.target.value)}>
          <option value="">No size chart</option>
          {charts.map((chart) => (
            <option key={chart.id} value={chart.id}>
              {chart.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex items-end">
        <div className="flex w-full items-center justify-between rounded-lg bg-ink-50 px-3 py-2.5 ring-1 ring-inset ring-ink-200">
          <div>
            <p className="text-xs font-semibold text-ink-700">Feature on home page</p>
            <p className="text-[11px] text-ink-500">Adds it to the featured rail (F-06.01).</p>
          </div>
          <Toggle
            checked={form.is_featured}
            onChange={(value) => setField("is_featured", value)}
            label="Feature on home page"
          />
        </div>
      </div>
    </div>
  );
}

/** F-03.08 / F-03.12 — price and availability, discount as a percentage. */
export function PricingFields({ form, setField, errors = {} }) {
  const base = Number(form.base_price) || 0;
  const percent = Number(form.discount_percent) || 0;
  const sale = Math.round(base * (100 - percent)) / 100;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Field
        label="Base price (₹)"
        required
        error={errors.base_price}
        hint="Before any offer. Variants may override this individually."
      >
        <Input
          type="number"
          min={0}
          step={1}
          value={form.base_price}
          invalid={Boolean(errors.base_price)}
          onChange={(e) => setField("base_price", e.target.value)}
          className="tabular"
          placeholder="0"
        />
      </Field>

      <Field
        label="Discount %"
        error={errors.discount_percent}
        hint="0–100. Set 0 to remove the offer."
      >
        <Input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={form.discount_percent}
          invalid={Boolean(errors.discount_percent)}
          onChange={(e) => setField("discount_percent", e.target.value)}
          className="tabular"
        />
      </Field>

      <div className="rounded-lg bg-brand-50 px-3 py-2.5 ring-1 ring-inset ring-brand-200">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-brand-700 uppercase">
          Customer pays
          <RequirementTag id="F-03.12" />
        </p>
        <p className="tabular mt-1 flex items-baseline gap-2">
          <span className="text-xl font-semibold text-brand-800">{money(sale)}</span>
          {percent > 0 ? (
            <span className="text-sm text-brand-500 line-through">{money(base)}</span>
          ) : null}
        </p>
        <p className="mt-1 text-[11px] text-brand-700/80">
          Derived, never typed — the database generates it from base price and percentage.
        </p>
      </div>

      <div className="md:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ink-50 px-3 py-2.5 ring-1 ring-inset ring-ink-200">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-700">
              Publish to storefront
              <RequirementTag id="F-03.08" />
            </p>
            <p className="text-[11px] text-ink-500">
              Inactive products stay in the catalogue and on past orders but are invisible to shoppers.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={form.is_active ? "green" : "slate"}>{form.is_active ? "Active" : "Draft"}</Badge>
            <Toggle
              checked={form.is_active}
              onChange={(value) => setField("is_active", value)}
              label="Publish to storefront"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** F-03.09 — free-form approved attributes recorded against the product. */
export function AttributeFields({ form, setField, reference }) {
  const groups = [
    { key: "fabric", label: "Fabric", list: reference?.attributes?.fabrics },
    { key: "work", label: "Work", list: reference?.attributes?.works },
    { key: "sleeve", label: "Sleeve", list: reference?.attributes?.sleeves },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {groups.map((group) => (
        <Field key={group.key} label={group.label}>
          <Select
            value={form.attributes?.[group.key] || ""}
            onChange={(e) =>
              setField("attributes", { ...form.attributes, [group.key]: e.target.value })
            }
          >
            <option value="">Not specified</option>
            {(group.list || [])
              .filter((item) => item.approved)
              .map((item) => (
                <option key={item.value} value={item.value}>
                  {item.value}
                </option>
              ))}
          </Select>
        </Field>
      ))}
    </div>
  );
}
