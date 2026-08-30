/**
 * @file constants.js
 * @description Centralized constants for Category Management.
 *
 * Not seed data — the fit list is a UI enum with no API counterpart. The
 * `fits` column stores whatever charts an admin configures, so the set of
 * fits offered when building one lives here.
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
