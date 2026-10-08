/**
 * @file utils.js
 * @description Helper utilities for Category Management.
 *
 * The slug helpers moved to `src/lib/slug.js` once Product Management
 * needed the same rule; they are re-exported here so the category
 * screens keep importing them from one place.
 */

export { autoSlug, SLUG_PATTERN } from "@/lib/slug";

