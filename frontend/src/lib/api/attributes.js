/**
 * The approved-values register behind the product attribute dropdowns.
 *
 * `products.attributes` records what a product is — {"fabric":"Cotton"}.
 * This register records what may be chosen, so the vocabulary is curated
 * once on /admin/products/attributes rather than retyped per product,
 * where "Cotton", "cotton " and "Coton" would all become distinct values.
 *
 * Two rules worth knowing, both enforced by the API:
 *
 *   retiring vs deleting
 *       Retiring (`active: false`) hides a value from new products and
 *       leaves the ones already using it alone. Deleting is refused
 *       while any product still carries the value.
 *
 *   renaming carries the products
 *       Renaming a value rewrites it on every product holding it, in one
 *       transaction — otherwise those products would show a value the
 *       register no longer offers.
 */

import { api } from "./client";

/**
 * The attribute groups the product form shows, in order.
 *
 * The API accepts any group name, so this list is presentation only:
 * adding a fourth entry here is all it takes to offer a new attribute.
 */
/**
 * Colour is registered here like any other value, but it is NOT one of
 * ATTRIBUTE_GROUPS below and must not be added to it.
 *
 * Everything in that list is a property of the product, stored in
 * `products.attributes` and edited by a dropdown on the product form.
 * Colour is a property of the sellable row — it lives on
 * `product_variants.colour`, carries its own stock, and is edited in the
 * size × colour matrix. Putting it in the list would put a second,
 * contradictory colour field on the form.
 *
 * What it shares with the others is the register: one curated
 * vocabulary, so "Maroon", "maroon " and "Marron" do not all reach the
 * catalogue. Plus a hex, which only colours use.
 */
export const COLOUR_GROUP = {
  key: "colour",
  label: "Colour",
  description: "The colourways products are sold in. Each carries its own stock.",
  placeholder: "e.g. Rani Pink",
};

/** Shown when a registered colour has no hex recorded. */
export const COLOUR_FALLBACK_HEX = "#E2E8F0";

/**
 * Fit is stored in `products.attributes` like fabric and work, but it is
 * NOT one of ATTRIBUTE_GROUPS below and must not be added to it.
 *
 * Its vocabulary is the shop's size charts. Every fit the shop cuts
 * already exists as a row in `size_charts`, keyed by a unique name, and
 * the storefront picks the table it prints beside the Buy button by
 * matching this value against that name. Curating the same list a second
 * time in the register would mean an admin could approve "Normal" while
 * the chart says "Normal Fit", and the piece would then show every chart
 * the shop has instead of its own.
 *
 * So the picker on the product form is filled from
 * `listFits()` in lib/api/sizeCharts.js, there is no inline "add" on it,
 * and the API refuses a `fit` row in the register outright. Adding a fit
 * means publishing its chart on /admin/size-charts — which is the work
 * that has to happen anyway.
 */
export const FIT_GROUP = {
  key: "fit",
  label: "Fit",
  description: "How the piece is cut. Decides which size chart the shopper sees.",
};

export const ATTRIBUTE_GROUPS = [
  {
    key: "fabric",
    label: "Fabric",
    description: "What the garment is made of.",
    placeholder: "e.g. Cotton",
  },
  {
    key: "work",
    label: "Work",
    description: "Embellishment or print type.",
    placeholder: "e.g. Zari",
  },
  {
    key: "sleeve",
    label: "Sleeve",
    description: "Sleeve length or style.",
    placeholder: "e.g. Half",
  },
];

export function toAttributeValue(dto) {
  if (!dto) return null;

  return {
    id: String(dto.id),
    groupName: dto.groupName ?? "",
    value: dto.value ?? "",
    // The swatch, on colours. Null on every other group, and null on a
    // colour nobody has picked a tone for yet — which renders as a name
    // chip rather than a dot.
    hex: dto.hex ?? null,
    active: Boolean(dto.active),
    position: Number(dto.position ?? 0),
    // How many products carry this value right now — through their
    // variants, for colour — which is what makes the retire/delete
    // decision an informed one.
    usageCount: Number(dto.usageCount ?? 0),
  };
}

/**
 * The whole register, keyed by group.
 *
 * @param {object} [options]
 * @param {boolean} [options.activeOnly]  what the product form asks for:
 *        a retired value must not be offered on a new product, but must
 *        still be listed on the register screen so it can be restored.
 * @returns {Promise<Record<string, Array>>}
 */
export async function listAttributeValues({ activeOnly = false, token, signal } = {}) {
  const { meta } = await api.get(
    `/productAttributes/getAllAttributeValues?activeOnly=${activeOnly}`,
    { token, signal, envelope: true },
  );

  return Object.fromEntries(
    Object.entries(meta?.groups ?? {}).map(([group, values]) => [
      group,
      values.map(toAttributeValue),
    ]),
  );
}

/**
 * @param {string} [options.hex]  the swatch, for a colour. Accepted in
 *        any of '#7B1E3A', '7B1E3A' or '#7B3' — the API expands and
 *        upper-cases it to one canonical form, so nothing downstream has
 *        to normalise before it can render.
 */
export async function createAttributeValue(groupName, value, { hex, token } = {}) {
  const data = await api.post(
    "/productAttributes/createAttributeValue",
    { groupName, value, ...(hex ? { hex } : {}) },
    { token },
  );

  return toAttributeValue(data);
}

/**
 * The registered colours, in register order, active ones only.
 *
 * A thin wrapper over the register read, because the product form wants
 * one group and reading the whole register to pick a key out of it is
 * the kind of thing that gets written three slightly different ways.
 *
 * A failed or empty register is not an error here — the matrix editor
 * still works, colours are simply typed rather than picked.
 *
 * @returns {Promise<Array<{id, value, hex, active, usageCount}>>}
 */
export async function listColours({ token, signal } = {}) {
  const groups = await listAttributeValues({ activeOnly: true, token, signal });
  return groups[COLOUR_GROUP.key] ?? [];
}

/**
 * Renames, retires or reorders a value.
 *
 * @returns {Promise<{value: object, productsUpdated: number}>}
 *          `productsUpdated` is non-zero only for a rename.
 */
export async function updateAttributeValue(id, patch, { token } = {}) {
  const { data, meta } = await api.put(
    `/productAttributes/updateAttributeValue/${encodeURIComponent(id)}`,
    patch,
    { token, envelope: true },
  );

  return {
    value: toAttributeValue(data),
    productsUpdated: meta?.productsUpdated ?? 0,
  };
}

export async function setAttributeValueActive(id, active, { token } = {}) {
  const data = await api.patch(
    `/productAttributes/updateAttributeValueStatus/${encodeURIComponent(id)}`,
    { active },
    { token },
  );

  return toAttributeValue(data);
}

/** Refused by the API with a 409 while any product still uses the value. */
export async function deleteAttributeValue(id, { token } = {}) {
  await api.del(
    `/productAttributes/deleteAttributeValue/${encodeURIComponent(id)}`,
    { token },
  );

  return { id };
}
