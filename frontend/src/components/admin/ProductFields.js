"use client";

import { useState } from "react";

import { ATTRIBUTE_GROUPS, createAttributeValue, FIT_GROUP } from "@/lib/api/attributes";
import { money } from "@/lib/format";
import { autoSlug } from "@/lib/slug";
import {
  calculateSalePrice,
  collect,
  MIN_PRICE,
  validateBasePrice,
  validateChoice,
  validateDescription,
  validateDiscountPercentage,
  validateProductName,
  validateSalePrice,
  validateSlug,
} from "@/lib/validate";
import { Badge, Button, cx, Field, Input, Select, Textarea, Toggle, useToast } from "./ui";

/**
 * The product form, split into the two cards every write screen shows.
 *
 * Field names match the API's DTO exactly — `basePrice`, not
 * `base_price` — so a form object can be handed to createProduct /
 * updateProduct without a translation step.
 */

/**
 * Every rule the product endpoints apply, run before the request.
 *
 * Lives here rather than on either page because both the create screen
 * and the edit screen post the same object, and two copies of this would
 * drift into a product the one screen accepts and the other refuses.
 *
 * The slug is checked as it will actually be sent: blank means "derive it
 * from the name", which is what both pages do on submit, so validating the
 * empty string would refuse a form that was about to work.
 *
 * The last rule is about the two price fields together rather than either
 * one. Each can be perfectly valid and still leave the customer paying
 * nothing between them — 100% off, or a base so small the discount rounds
 * it away — and `current_price` is what the storefront prints on the Buy
 * button. `base_price >= 0` is all the column enforces, so this is the
 * only thing standing between a fat-fingered discount and a free product.
 *
 * Sizes are not checked here. They are their own table, their own request
 * and their own editor, which does its own arithmetic on stock counts.
 */
export function validateProductForm(form) {
  return collect([
    ["name", validateProductName(form.name)],
    ["slug", validateSlug(form.slug || autoSlug(form.name), { label: "URL slug" })],
    ["description", validateDescription(form.description)],
    ["categoryId", validateChoice(form.categoryId, "Category")],
    ["basePrice", validateBasePrice(form.basePrice)],
    [
      "discountPercentage",
      validateDiscountPercentage(form.discountPercentage) ??
        validateSalePrice(form.basePrice, form.discountPercentage),
    ],
  ]);
}

/**
 * Which tab on the edit screen each field lives on.
 *
 * A price refused while the admin is looking at the Details tab is a
 * message nobody can see and a Save button that appears to do nothing, so
 * the screen moves to the tab holding the first failure.
 */
export const FIELD_TAB = {
  name: "details",
  slug: "details",
  description: "details",
  categoryId: "details",
  basePrice: "pricing",
  discountPercentage: "pricing",
};

/** Identity, description and where the product sits in the catalogue. */
export function DetailsFields({ form, setField, errors = {}, reference, lockCategory = false }) {
  const categories = reference?.categories ?? [];

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
          onChange={(e) => setField("categoryId", e.target.value)}
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
 * Fit, fabric, work and sleeve — stored together in the `attributes`
 * JSONB column.
 *
 * Dropdowns rather than free text, because a curated list is what stops
 * "Cotton", "cotton " and "Coton" all reaching the catalogue. Where the
 * list comes from differs for the fit, and the difference matters:
 *
 *   fabric, work, sleeve   the approved-values register. A value missing
 *                          from the list is added inline, which writes it
 *                          to the register and makes it available
 *                          everywhere — so entering a product never means
 *                          stopping to visit the attributes screen first
 *
 *   fit                    the shop's published size charts. The fit is
 *                          what decides which table a shopper is shown
 *                          beside the Buy button, so it can only be a fit
 *                          a chart exists for — there is nothing to add
 *                          inline, because adding a fit means publishing
 *                          its chart. The API refuses an unknown one
 *
 * `groups` is the register, keyed by attribute: { fabric: [...], ... }.
 * `fits` is the size charts' list: [{ fit, title }, ...].
 */
export function AttributeFields({ form, setField, groups = {}, fits = [], onRegister }) {
  // A cleared field means "not recorded", not an empty string — the API
  // drops blanks anyway, so keep the form in step.
  const choose = (key, value) => {
    const next = { ...form.attributes };

    if (value) next[key] = value;
    else delete next[key];

    setField("attributes", next);
  };

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <FitSelect
        fits={fits}
        selected={form.attributes?.[FIT_GROUP.key] ?? ""}
        onSelect={(value) => choose(FIT_GROUP.key, value)}
      />

      {ATTRIBUTE_GROUPS.map((group) => (
        <AttributeSelect
          key={group.key}
          group={group}
          values={groups[group.key] ?? []}
          selected={form.attributes?.[group.key] ?? ""}
          onSelect={(value) => choose(group.key, value)}
          onRegister={onRegister}
        />
      ))}
    </div>
  );
}

/**
 * How the piece is cut, picked from the fits the shop publishes a chart
 * for.
 *
 * No inline add, unlike its neighbours. A fit with no chart behind it
 * would leave the product page showing every chart the shop has — the
 * exact thing recording a fit is for — so the way to add one is to
 * publish its chart, and the hint says so.
 *
 * A fit already on the product is kept in the list even when it is no
 * longer offered — a chart withdrawn in April must not silently strip
 * the fit off every product the next time one of them is saved.
 */
function FitSelect({ fits, selected, onSelect }) {
  const known = fits.some((entry) => entry.fit === selected);
  const options = known || !selected ? fits : [...fits, { fit: selected, title: "" }];

  return (
    <Field
      label={FIT_GROUP.label}
      hint={
        fits.length
          ? "Decides which size chart the shopper sees. Add a fit by publishing its chart."
          : "No size charts published yet — publish one to offer a fit."
      }
    >
      <Select value={selected} onChange={(e) => onSelect(e.target.value)}>
        <option value="">Not specified — shows every chart</option>
        {options.map((entry) => (
          <option key={entry.fit} value={entry.fit}>
            {entry.fit}
            {known || entry.fit !== selected ? "" : " — no published chart"}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function AttributeSelect({ group, values, selected, onSelect, onRegister }) {
  const toast = useToast();

  const [addingOpen, setAddingOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  // A product saved before a value was retired still shows it, rather
  // than silently losing the attribute when the form loads.
  const options = values.some((value) => value.value === selected)
    ? values
    : selected
      ? [...values, { id: `current-${selected}`, value: selected, active: false }]
      : values;

  async function add() {
    const value = draft.trim();
    if (!value) return;

    setBusy(true);
    try {
      const created = await createAttributeValue(group.key, value);
      onSelect(created.value);
      await onRegister?.();
      toast.success(`"${created.value}" added to ${group.label.toLowerCase()}.`);
      setDraft("");
      setAddingOpen(false);
    } catch (err) {
      toast.error(err.message || "Could not add the value.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field
      label={group.label}
      hint={
        values.length
          ? `${values.length} approved · manage on the attributes screen`
          : "Nothing approved yet — add the first below."
      }
    >
      <Select value={selected} onChange={(e) => onSelect(e.target.value)}>
        <option value="">Not specified</option>
        {options.map((value) => (
          <option key={value.id} value={value.value}>
            {value.value}
            {value.active ? "" : " — retired"}
          </option>
        ))}
      </Select>

      {addingOpen ? (
        <div className="mt-1.5 flex items-center gap-1.5">
          <Input
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
              if (e.key === "Escape") setAddingOpen(false);
            }}
            placeholder={group.placeholder}
            maxLength={100}
            className="h-8 text-xs"
            aria-label={`New ${group.label.toLowerCase()} value`}
          />
          <Button size="sm" variant="primary" busy={busy} disabled={!draft.trim()} onClick={add}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAddingOpen(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingOpen(true)}
          className="mt-1.5 text-[11px] font-medium text-brand-600 hover:text-brand-700 hover:underline"
        >
          + Add a new {group.label.toLowerCase()}
        </button>
      )}
    </Field>
  );
}

/** Price, offer percentage and storefront visibility. */
export function PricingFields({ form, setField, errors = {} }) {
  const base = Number(form.basePrice) || 0;
  const percent = Number(form.discountPercentage) || 0;

  // The API's own arithmetic rather than a second version of it. The old
  // line here — `Math.round(base * (100 - percent)) / 100` — quietly
  // disagreed with the server for any percentage that was not a whole
  // number, so the preview showed a price the product would not be sold at.
  const sale = calculateSalePrice(form.basePrice, form.discountPercentage);

  // Live, so the shop sees the problem while typing the number that caused
  // it rather than when they reach the Save button at the bottom of the
  // page. The same rules run again on submit — this is the courtesy, the
  // one in validateProductForm is the gate.
  //
  // `required = false` on purpose: an empty box on a form nobody has
  // filled in yet has not failed, it is simply empty, and the asterisk
  // already says it is needed. What is checked live is a value that is
  // *wrong* — 0, negative, or not a number.
  const priceProblem = errors.basePrice ?? validateBasePrice(form.basePrice, false);
  const discountProblem =
    errors.discountPercentage ??
    validateDiscountPercentage(form.discountPercentage) ??
    validateSalePrice(form.basePrice, form.discountPercentage);

  // A product nobody can be charged for. Worth shouting about in the one
  // place that shows the figure the shopper would actually see — but only
  // once there is a price to be wrong about. Against the paisa floor
  // rather than zero, so the panel agrees with the rule that refuses it.
  const free = String(form.basePrice ?? "").trim() !== "" && sale < MIN_PRICE;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Field
        label="Base price (₹)"
        required
        error={priceProblem}
        hint="Before any offer. Must be more than ₹0."
      >
        <Input
          type="number"
          // `min` is a browser hint only: nothing here submits a form, so
          // constraint validation never runs and a typed -5 reaches the
          // API. The check above is what actually refuses it.
          min={1}
          step={1}
          value={form.basePrice}
          invalid={Boolean(priceProblem)}
          onChange={(e) => setField("basePrice", e.target.value)}
          className="tabular"
          placeholder="1499"
        />
      </Field>

      <Field
        label="Discount %"
        error={discountProblem}
        hint="0–99. Set 0 to remove the offer."
      >
        <Input
          type="number"
          min={0}
          max={99}
          step={0.5}
          value={form.discountPercentage}
          invalid={Boolean(discountProblem)}
          onChange={(e) => setField("discountPercentage", e.target.value)}
          className="tabular"
        />
      </Field>

      <div
        className={cx(
          "rounded-lg px-3 py-2.5 ring-1 ring-inset",
          free ? "bg-red-50 ring-red-200" : "bg-brand-50 ring-brand-200",
        )}
      >
        <p
          className={cx(
            "text-[11px] font-semibold tracking-wide uppercase",
            free ? "text-red-700" : "text-brand-700",
          )}
        >
          Customer pays
        </p>
        <p className="tabular mt-1 flex items-baseline gap-2">
          <span
            className={cx(
              "text-xl font-semibold",
              free ? "text-red-800" : "text-brand-800",
            )}
          >
            {money(sale)}
          </span>
          {percent > 0 && !free ? (
            <span className="text-sm text-brand-500 line-through">{money(base)}</span>
          ) : null}
        </p>
        <p
          className={cx(
            "mt-1 text-[11px]",
            free ? "text-red-700" : "text-brand-700/80",
          )}
        >
          {free ? (
            "Nothing can be sold for ₹0. Raise the base price or lower the discount."
          ) : (
            <>
              Derived, never typed — the API writes{" "}
              <code className="font-mono">current_price</code> from the base price and
              the percentage.
            </>
          )}
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
