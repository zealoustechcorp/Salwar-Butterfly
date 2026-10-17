/**
 * The hand-picked shelves on the home page (F-06), admin side.
 *
 * A section is a titled row of products the shop chose by hand — Best
 * sellers, a Diwali or Pongal sale, a Wedding edit — drawn in one of the
 * layouts in lib/store/shelfThemes.js. The storefront reads the live ones
 * through its own public route; everything here is admin-only.
 *
 * Things about the API worth knowing before calling it:
 *
 *   - **Create and update send the whole shelf.** `updateSection` is a
 *     full replace, picked pieces included, in order. A piece left out of
 *     `productIds` is taken off the shelf.
 *   - **A blank slug is derived from the title.** A title with no Latin
 *     letters or digits (Tamil only, say) derives nothing, and the API
 *     answers with a field error on `slug` asking for one to be typed.
 *   - **The window is optional at both ends.** No start means "from now",
 *     no end means "until switched off". Dates travel as ISO instants; the
 *     screen reads and writes them as shop time (IST) — see the helpers at
 *     the bottom of this file.
 *   - **Reorder and delete answer with the whole list**, like the stories
 *     client, so the screen never has to guess at positions.
 *
 * Errors are the `ApiError` thrown by the shared client; a 400 carries
 * per-field messages in `error.fields`.
 */

import { api } from "./client";

/** Mirrors MAX_SECTIONS in backend/src/config/home_section.policy.js. */
export const MAX_SECTIONS = 30;

/** Mirrors MAX_PRODUCTS_PER_SECTION. The home page shows the first ten. */
export const MAX_PRODUCTS_PER_SECTION = 40;

/** How many picked pieces the home page itself shows; the rest are behind "View all". */
export const PRODUCTS_ON_HOME = 10;

/** Mirrors MAX_TITLE_LENGTH, and home_sections.title VARCHAR(80). */
export const MAX_TITLE_LENGTH = 80;

/** Mirrors MAX_SUBTITLE_LENGTH, and home_sections.subtitle VARCHAR(200). */
export const MAX_SUBTITLE_LENGTH = 200;

/** Mirrors MAX_SLUG_LENGTH, and home_sections.slug VARCHAR(100). */
export const MAX_SLUG_LENGTH = 100;

/** Mirrors SLUG_PATTERN — lower-case words joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The shop's clock. Every date on these screens is read and typed in it. */
export const SHOP_TIME_ZONE = "Asia/Kolkata";

// ============================================================
// WIRE <-> UI SHAPE
// ============================================================

function toPickedProduct(dto) {
  return {
    id: String(dto.id),
    name: dto.name ?? "",
    slug: dto.slug ?? "",
    // false means "picked, but off sale" — the shelf skips it on the home
    // page, and the editor warns about it.
    active: Boolean(dto.active),
    price: dto.price == null ? null : Number(dto.price),
  };
}

export function toSection(dto) {
  if (!dto) return null;

  return {
    id: String(dto.id),
    title: dto.title ?? "",
    subtitle: dto.subtitle ?? "",
    slug: dto.slug ?? "",
    startsAt: dto.startsAt ?? null,
    endsAt: dto.endsAt ?? null,
    position: Number(dto.position ?? 0),
    active: Boolean(dto.active),
    layout: dto.layout ?? "cards",
    theme: dto.theme ?? "",
    isLive: Boolean(dto.isLive),
    productCount: Number(dto.productCount ?? 0),
    // Only a single-section read carries the picks; the list does not.
    productIds: (dto.productIds ?? []).map(String),
    products: (dto.products ?? []).map(toPickedProduct),
    createdAt: dto.createdAt ?? null,
    updatedAt: dto.updatedAt ?? null,
  };
}

/**
 * The body create and update both send. Only the keys the validator
 * knows: anything else would be carried around by the form, not the API.
 */
function toBody(fields) {
  return {
    title: String(fields.title ?? "").trim(),
    // "" rather than omitted: blank is how a subtitle or slug is cleared.
    subtitle: String(fields.subtitle ?? "").trim(),
    slug: String(fields.slug ?? "").trim().toLowerCase(),
    startsAt: fields.startsAt || null,
    endsAt: fields.endsAt || null,
    active: Boolean(fields.active),
    layout: fields.layout,
    theme: fields.theme,
    productIds: (fields.productIds ?? []).map(String),
  };
}

// ============================================================
// CALLS
// ============================================================

/** Every section, live or not, top shelf first. */
export async function listSections({ token, signal } = {}) {
  const data = await api.get("/homeSections/getHomeSections", { token, signal });

  return (data ?? []).map(toSection);
}

/** One section, with its picked pieces in order. */
export async function getSection(id, { token, signal } = {}) {
  const data = await api.get(
    `/homeSections/getHomeSectionById/${encodeURIComponent(id)}`,
    { token, signal },
  );

  return toSection(data);
}

/** Makes a section. Goes to the end of the list. */
export async function createSection(fields, { token } = {}) {
  const data = await api.post("/homeSections/createHomeSection", toBody(fields), {
    token,
  });

  return toSection(data);
}

/** Replaces a section — fields and picked pieces both. */
export async function updateSection(id, fields, { token } = {}) {
  const data = await api.put(
    `/homeSections/updateHomeSection/${encodeURIComponent(id)}`,
    toBody(fields),
    { token },
  );

  return toSection(data);
}

/** The switch: off keeps the section and its pieces, and hides it. */
export async function setSectionActive(id, active, { token } = {}) {
  const data = await api.patch(
    `/homeSections/setHomeSectionActive/${encodeURIComponent(id)}`,
    { active: Boolean(active) },
    { token },
  );

  return toSection(data);
}

/**
 * The order the shelves are stacked in.
 *
 * Takes every section's id — the API refuses a partial list rather than
 * half-applying it, so a stale screen is told so.
 */
export async function reorderSections(ids, { token } = {}) {
  const data = await api.patch(
    "/homeSections/reorderHomeSections",
    { ids },
    { token },
  );

  return (data ?? []).map(toSection);
}

/**
 * Deletes a section outright. The products are untouched — only the
 * shelf and its picks go. Returns what is left.
 */
export async function deleteSection(id, { token } = {}) {
  const data = await api.del(
    `/homeSections/deleteHomeSection/${encodeURIComponent(id)}`,
    { token },
  );

  return (data ?? []).map(toSection);
}

// ============================================================
// STATUS AND SHOP TIME
// ============================================================

/**
 * Where a section stands right now, in one word for the status pill.
 *
 * Worked out here rather than read off `isLive` so the screen can say
 * *why* a section is not showing — switched off, not started, or over.
 *
 * @returns {"off"|"scheduled"|"ended"|"live"}
 */
export function sectionStatus(section, now = Date.now()) {
  if (!section.active) return "off";
  if (section.startsAt && new Date(section.startsAt).getTime() > now) return "scheduled";
  if (section.endsAt && new Date(section.endsAt).getTime() <= now) return "ended";

  return "live";
}

// IST has no daylight saving, so a fixed offset is exact all year.
const IST_OFFSET = "+05:30";
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * An ISO instant -> the "YYYY-MM-DDTHH:mm" a datetime-local input shows,
 * in shop time regardless of the browser's own time zone.
 */
export function isoToShopInput(iso) {
  if (!iso) return "";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  // Shifted by the offset and read back as UTC, which is IST wall time.
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/**
 * What a datetime-local input holds, read as shop time -> an ISO instant.
 * Blank stays null ("no limit"); something unparseable is returned as-is
 * so the API can name it as a field error.
 */
export function shopInputToIso(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const date = new Date(`${text.length === 16 ? `${text}:00` : text}${IST_OFFSET}`);

  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

const SHOP_DATE = new Intl.DateTimeFormat("en-IN", {
  timeZone: SHOP_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "17 Oct 2026, 6:00 pm" in shop time, or "" for no date. */
export function formatShopDate(iso) {
  if (!iso) return "";

  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? "" : SHOP_DATE.format(date);
}

/** The window in words, for the list: "Always on", "From …", "Until …", "… – …". */
export function formatWindow(section) {
  const from = formatShopDate(section.startsAt);
  const until = formatShopDate(section.endsAt);

  if (from && until) return `${from} – ${until}`;
  if (from) return `From ${from}`;
  if (until) return `Until ${until}`;

  return "Always on";
}
