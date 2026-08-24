/**
 * @file constants.js
 * @description Centralized constants for Category Management (F-02 Catalogue module).
 * Defines standardized fit categories and their corresponding UI thematic colors
 * used across category cards, badges, size chart tables, and detail screens.
 */

/**
 * Standard garment fit classifications supported by Salwar Butterfly.
 * Used when creating or editing categories to configure appropriate size charts
 * and garment tailoring dimensions:
 * - "Slim Fit": Tailored cut with narrower waist and chest measurements.
 * - "Normal Fit": Standard traditional ethnic wear fit with relaxed chest/waist ease.
 * - "Special Dress": Floor-length gowns, flared Anarkalis, and occasion wear.
 */
export const FIT_TYPES = ["Slim Fit", "Normal Fit", "Special Dress"];

/**
 * Brand color palette mappings (hex codes) associated with each garment fit type.
 * Used for badge borders, category tags, background accents, and size chart indicators
 * to provide quick visual differentiation across admin views.
 */
export const FIT_COLORS = {
  "Slim Fit": "#63242f",
  "Normal Fit": "#522d1a",
  "Special Dress": "#9b5e8a",
};

