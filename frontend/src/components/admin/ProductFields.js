"use client";

import { money } from "@/lib/format";
import { autoSlug } from "@/lib/slug";
import { Badge, Field, Input, Select, Textarea, Toggle } from "./ui";

/**
 * The product form, split into the two cards every write screen shows.
 *
 * Field names match the API's DTO exactly — `basePrice`, not
 * `base_price` — so a form object can be handed to createProduct /
 * updateProduct without a translation step.
 */

/** Identity, description and where the product sits in the catalogue. */
export function DetailsFields({ form, setField, errors = {}, reference, lockCategory = false }) {
  const categories = reference?.categories ?? [];

  // A sub-category belongs to one category, so the picker only offers the
  // ones under the category currently selected.
  const subCategories = (reference?.subCategories ?? []).filter(
    (sub) => sub.categoryId === form.categoryId,
  );

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
        required
        className="md:col-span-2"
        error={errors.slug}
        hint="Derived from the name. Must be unique across the catalogue."
      >
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-xs text-ink-400">
            salwarbutterfly.com/product/
          </span>
          <Input
            value={form.slug}
            invalid={Boolean(errors.slug)}
            onChange={(e) => setField("slug", autoSlug(e.target.value))}
            placeholder={autoSlug(form.name) || "product-slug"}
            className="font-mono text-xs"
          />
        </div>
      </Field>

      <Field
        label="Description"
        className="md:col-span-2"
        error={errors.description}
        hint="Fabric, fit, care and what is included. Also feeds storefront search."
      >
        <Textarea
          value={form.description}
          onChange={(e) => setField("description", e.target.value)}
          placeholder="Floor-length Chanderi silk Anarkali with zari border…"
        />
      </Field>

      <Field
        label="Category"
        required
        error={errors.categoryId}
        hint={
          lockCategory
            ? "Shared by every product in this upload."
            : "One category per product — the column is NOT NULL."
        }
      >
        <Select
          value={form.categoryId}
          invalid={Boolean(errors.categoryId)}
          disabled={lockCategory}
          onChange={(e) => {
            setField("categoryId", e.target.value);
            // The old sub-category belongs to the old category.
            setField("subCategoryId", "");
          }}
        >
          <option value="">Select a category…</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
              {category.active ? "" : " — inactive"}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Sub-category"
        error={errors.subCategoryId}
        hint={
          form.categoryId
            ? "Optional. Only sub-categories of the chosen category are listed."
            : "Pick a category first."
        }
      >
        <Select
          value={form.subCategoryId}
          invalid={Boolean(errors.subCategoryId)}
          disabled={!form.categoryId || subCategories.length === 0}
          onChange={(e) => setField("subCategoryId", e.target.value)}
        >
          <option value="">
            {form.categoryId && subCategories.length === 0
              ? "No sub-categories in this category"
              : "None"}
          </option>
          {subCategories.map((sub) => (
            <option key={sub.id} value={sub.id}>
              {sub.name}
              {sub.active ? "" : " — inactive"}
            </option>
          ))}
        </Select>
      </Field>

      <div className="md:col-span-2">
        <div className="flex items-center justify-between gap-3 rounded-lg bg-ink-50 px-3 py-2.5 ring-1 ring-inset ring-ink-200">
          <div>
            <p className="text-xs font-semibold text-ink-700">Feature on the home page</p>
            <p className="text-[11px] text-ink-500">Adds it to the featured rail on the storefront.</p>
          </div>
          <Toggle
            checked={form.isFeatured}
            onChange={(value) => setField("isFeatured", value)}
            label="Feature on the home page"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Fabric, work and sleeve — stored together in the `attributes` JSONB
 * column, so a fourth attribute later needs no migration.
 *
 * There is no approved-values register to pick from, and deliberately
 * so: each field offers the values already used elsewhere in the
 * catalogue (passed in as `suggestions`) through a datalist, while
 * staying free text. The vocabulary converges on its own, and a real
 * register can replace this later without touching stored data.
 */
export function AttributeFields({ form, setField, suggestions = {} }) {
  const groups = [
    { key: "fabric", label: "Fabric", placeholder: "e.g. Cotton" },
    { key: "work", label: "Work", placeholder: "e.g. Zari" },
    { key: "sleeve", label: "Sleeve", placeholder: "e.g. Half" },
  ];

  function setAttribute(key, value) {
    const next = { ...form.attributes };

    // A cleared field means "not recorded", not an empty string — the
    // API drops blanks anyway, so keep the form in step with storage.
    if (value.trim()) next[key] = value;
    else delete next[key];

    setField("attributes", next);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {groups.map((group) => {
        const options = suggestions[group.key] ?? [];
        const listId = `attribute-${group.key}-options`;

        return (
          <Field
            key={group.key}
            label={group.label}
            hint={
              options.length
                ? `${options.length} already in use — start typing`
                : "Free text. Reused across products as you go."
            }
          >
            <Input
              value={form.attributes?.[group.key] ?? ""}
              onChange={(e) => setAttribute(group.key, e.target.value)}
              placeholder={group.placeholder}
              maxLength={100}
              list={options.length ? listId : undefined}
            />
            {options.length ? (
              <datalist id={listId}>
                {options.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            ) : null}
          </Field>
        );
      })}
    </div>
  );
}

/** Price, offer percentage and storefront visibility. */
export function PricingFields({ form, setField, errors = {} }) {
  const base = Number(form.basePrice) || 0;
  const percent = Number(form.discountPercentage) || 0;
  const sale = Math.round(base * (100 - percent)) / 100;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Field
        label="Base price (₹)"
        required
        error={errors.basePrice}
        hint="Before any offer."
      >
        <Input
          type="number"
          min={0}
          step={1}
          value={form.basePrice}
          invalid={Boolean(errors.basePrice)}
          onChange={(e) => setField("basePrice", e.target.value)}
          className="tabular"
          placeholder="0"
        />
      </Field>

      <Field
        label="Discount %"
        error={errors.discountPercentage}
        hint="0–100. Set 0 to remove the offer."
      >
        <Input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={form.discountPercentage}
          invalid={Boolean(errors.discountPercentage)}
          onChange={(e) => setField("discountPercentage", e.target.value)}
          className="tabular"
        />
      </Field>

      <div className="rounded-lg bg-brand-50 px-3 py-2.5 ring-1 ring-inset ring-brand-200">
        <p className="text-[11px] font-semibold tracking-wide text-brand-700 uppercase">
          Customer pays
        </p>
        <p className="tabular mt-1 flex items-baseline gap-2">
          <span className="text-xl font-semibold text-brand-800">{money(sale)}</span>
          {percent > 0 ? (
            <span className="text-sm text-brand-500 line-through">{money(base)}</span>
          ) : null}
        </p>
        <p className="mt-1 text-[11px] text-brand-700/80">
          Derived, never typed — the API writes <code className="font-mono">current_price</code>{" "}
          from the base price and the percentage.
        </p>
      </div>

      <div className="md:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ink-50 px-3 py-2.5 ring-1 ring-inset ring-ink-200">
          <div>
            <p className="text-xs font-semibold text-ink-700">Publish to storefront</p>
            <p className="text-[11px] text-ink-500">
              Inactive products stay in the catalogue and on past orders but are invisible to
              shoppers.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={form.active ? "green" : "slate"}>{form.active ? "Active" : "Draft"}</Badge>
            <Toggle
              checked={form.active}
              onChange={(value) => setField("active", value)}
              label="Publish to storefront"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
