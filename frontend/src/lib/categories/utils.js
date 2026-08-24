/**
 * @file utils.js
 * @description Helper utilities for Category Management (F-02 Catalogue module).
 * Provides automated size chart template generators and SEO URL slug formatters.
 */

/**
 * Generates an empty default size chart measurement skeleton for a given garment fit type.
 * 
 * - For "Special Dress" (Anarkali gowns, occasion wear): Uses numerical dress sizing (4, 6, 8, 10).
 * - For all other fits ("Slim Fit", "Normal Fit"): Uses standard alphanumeric sizing (XS, S, M, L, XL).
 * 
 * Measurement columns provided for each row:
 * - `size`: The label for the garment size.
 * - `chest`: Circumference across the fullest part of chest/bust (cm).
 * - `waist`: Circumference at natural waistline (cm).
 * - `hip`: Circumference around the fullest part of hips (cm).
 * - `length`: Total vertical garment length from shoulder/waist (cm).
 *
 * @param {string} fit - The fit classification ("Slim Fit", "Normal Fit", or "Special Dress")
 * @returns {{ fit: string, rows: Array<{ size: string, chest: string, waist: string, hip: string, length: string }> }} Initialized size chart structure
 */
export function defaultSizeChartFor(fit) {
  if (fit === "Special Dress") {
    return {
      fit,
      rows: [
        { size: "4", chest: "", waist: "", hip: "", length: "" },
        { size: "6", chest: "", waist: "", hip: "", length: "" },
        { size: "8", chest: "", waist: "", hip: "", length: "" },
        { size: "10", chest: "", waist: "", hip: "", length: "" },
      ],
    };
  }
  return {
    fit,
    rows: [
      { size: "XS", chest: "", waist: "", hip: "", length: "" },
      { size: "S", chest: "", waist: "", hip: "", length: "" },
      { size: "M", chest: "", waist: "", hip: "", length: "" },
      { size: "L", chest: "", waist: "", hip: "", length: "" },
      { size: "XL", chest: "", waist: "", hip: "", length: "" },
    ],
  };
}

/**
 * Automatically converts human-readable category names into URL-safe, SEO-friendly slugs.
 * 
 * Transformation steps:
 * 1. Converts input string to lowercase (`.toLowerCase()`).
 * 2. Replaces all whitespace sequences with single hyphens (`/\s+/g -> '-'`).
 * 3. Strips away all non-alphanumeric characters except hyphens (`/[^a-z0-9-]/g -> ''`).
 *
 * Example: "Cotton Daily Wear & Kurtis!" -> "cotton-daily-wear--kurtis"
 *
 * @param {string} name - Raw category name input by the user
 * @returns {string} Sanitized URL slug for routing and storefront category URLs
 */
export function autoSlug(name) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

