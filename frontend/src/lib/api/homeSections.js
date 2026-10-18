/**
 * The two home page sections (F-06), admin side.
 *
 * The home page has exactly two hand-picked sections, fixed by the shop:
 * **Best sellers** and a **custom section** the shop renames for whatever is
 * running — a Diwali sale, Pongal specials, a collection. They are addressed
 * by key (`best-sellers`, `custom`), which never changes. Nothing is created,
 * deleted or reordered; the shop changes a section's name, its description
 * and its pieces.
 *
 * Pieces can be picked two ways, and both end in the same table:
 *
 *   - on the section's own page — `updateSection` replaces the name, the
 *     description and the whole list of pieces at once;
 *   - on a product's page — `setProductSections` puts that one product in
 *     exactly the sections ticked.
 *
 * A section with no pieces is not drawn on the home page; that is how one
 * is hidden.
 *
 * Errors are the `ApiError` thrown by the shared client; a 400 carries
 * per-field messages in `error.fields`.
 */

import { api } from "./client";

/** Mirrors FIXED_SECTIONS in backend/src/config/home_section.policy.js. */
export const SECTION_KEYS = ["best-sellers", "custom"];

/** What each section is for, as the admin screens describe it. */
export const SECTION_HINTS = {
  "best-sellers": "The pieces customers love most.",
  custom: "Rename it for whatever is running: Diwali Sale, Pongal Specials, a new collection.",
};

/** Mirrors MAX_PRODUCTS_PER_SECTION. */
export const MAX_PRODUCTS_PER_SECTION = 40;

/** Mirrors MAX_TITLE_LENGTH, and home_sections.title VARCHAR(80). */
export const MAX_TITLE_LENGTH = 80;

/** Mirrors MAX_SUBTITLE_LENGTH, and home_sections.subtitle VARCHAR(200). */
export const MAX_SUBTITLE_LENGTH = 200;

export function toSection(dto) {
  if (!dto) return null;

  return {
    key: dto.slug,
    title: dto.title ?? "",
    subtitle: dto.subtitle ?? "",
    productCount: Number(dto.productCount ?? 0),
    productIds: (dto.productIds ?? []).map(String),
    products: (dto.products ?? []).map((product) => ({
      id: String(product.id),
      name: product.name ?? "",
      active: product.active !== false,
    })),
    updatedAt: dto.updatedAt ?? null,
  };
}

/** Both sections, Best sellers first. */
export async function listSections({ signal } = {}) {
  const data = await api.get("/homeSections/getHomeSections", { signal });

  return (data ?? []).map(toSection);
}

/** One section by key. */
export async function getSection(key, { signal } = {}) {
  const data = await api.get(`/homeSections/getHomeSection/${encodeURIComponent(key)}`, {
    signal,
  });

  return toSection(data);
}

/** Saves a section's name, description and pieces (the whole list, in order). */
export async function updateSection(key, { title, subtitle, productIds }) {
  const data = await api.put(`/homeSections/updateHomeSection/${encodeURIComponent(key)}`, {
    title: String(title ?? "").trim(),
    subtitle: String(subtitle ?? "").trim(),
    productIds,
  });

  return toSection(data);
}

/** The keys of the sections one product is in. */
export async function getProductSections(productId, { signal } = {}) {
  const data = await api.get(
    `/homeSections/getProductSections/${encodeURIComponent(productId)}`,
    { signal },
  );

  return data?.sections ?? [];
}

/** Puts one product in exactly these sections; returns the keys it is now in. */
export async function setProductSections(productId, keys) {
  const data = await api.put(
    `/homeSections/setProductSections/${encodeURIComponent(productId)}`,
    { sections: keys },
  );

  return data?.sections ?? [];
}
