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
    active: Boolean(dto.active),
    position: Number(dto.position ?? 0),
    // How many products carry this value right now — what makes the
    // retire/delete decision an informed one.
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

export async function createAttributeValue(groupName, value, { token } = {}) {
  const data = await api.post(
    "/productAttributes/createAttributeValue",
    { groupName, value },
    { token },
  );

  return toAttributeValue(data);
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
