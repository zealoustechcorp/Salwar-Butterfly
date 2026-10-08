/**
 * @file slug.js
 * @description URL slug helpers shared by every admin module.
 *
 * The category and product validators on the API accept the same shape,
 * so the rule lives in one place rather than once per feature.
 */

/**
 * The shape the API's slug validators accept: lowercase alphanumeric
 * groups joined by single hyphens, with no hyphen at either end.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Turns a human-readable name into a URL-safe, SEO-friendly slug.
 *
 * 1. Lowercases the input.
 * 2. Replaces every run of non-alphanumeric characters with one hyphen.
 * 3. Trims any leading or trailing hyphen.
 *
 * Steps 2 and 3 exist because the API rejects doubled and dangling
 * hyphens outright — a naive strip would turn "Cotton Daily Wear &
 * Kurtis!" into "cotton-daily-wear--kurtis" and fail validation.
 *
 * @param {string} name
 * @returns {string}
 */
export function autoSlug(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
