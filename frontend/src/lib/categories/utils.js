/**
 * @file utils.js
 * @description Helper utilities for Category Management.
 * Provides automated size chart template generators and SEO URL slug formatters.
 *
 * The slug helpers moved to `src/lib/slug.js` once Product Management
 * needed the same rule; they are re-exported here so the category
 * screens keep importing them from one place.
 */

export { autoSlug, SLUG_PATTERN } from "@/lib/slug";

/**
 * Generates an empty default size chart measurement skeleton for a given garment fit type.
 * 
 * - For "Special Dress" (Anarkali gowns, occasion wear): Uses numerical dress sizing (4, 6, 8, 10).
 * - For all other fits ("Slim Fit", "Normal Fit"): Uses the shop's own size ladder, which is
 *   the bust in inches (34, 36, 38, 40, 42) — the same numbers the size chips on a product
 *   offer, so a shopper reads their size straight off the chart.
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
      { size: "34", chest: "", waist: "", hip: "", length: "" },
      { size: "36", chest: "", waist: "", hip: "", length: "" },
      { size: "38", chest: "", waist: "", hip: "", length: "" },
      { size: "40", chest: "", waist: "", hip: "", length: "" },
      { size: "42", chest: "", waist: "", hip: "", length: "" },
    ],
  };
}


