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


