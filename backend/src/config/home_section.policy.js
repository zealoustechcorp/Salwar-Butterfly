// src/config/home_section.policy.js
//
// The one definition of what a home page section may be (F-06).
//
// The validator and the service refuse on these, and the migrations repeat
// what they can as CHECK constraints.

/** Matches home_sections.title VARCHAR(80). A section heading, not a sentence. */
export const MAX_TITLE_LENGTH = 80;

/** Matches home_sections.subtitle VARCHAR(200). */
export const MAX_SUBTITLE_LENGTH = 200;

/**
 * The one hand-picked section the home page has (030). Addressed by slug,
 * which never changes; the title is the shop's to rename — "Best sellers",
 * "Diwali Sale", whatever it needs. Kept a list so the validator and the
 * product checkboxes need not change if a second ever returns.
 */
export const FIXED_SECTIONS = ["custom"];

/**
 * The most pieces one section may hold. A sideways row on the home page,
 * so a little more than a shopper will scroll through.
 */
export const MAX_PRODUCTS_PER_SECTION = 40;

/**
 * Still on the table from 028, and still CHECKed there, though nothing sets
 * them any more: every section is drawn the same way.
 */
export const LAYOUTS = ["festival", "cards", "editorial"];
export const THEMES = [
  "maroon-gold",
  "turmeric-leaf",
  "emerald",
  "saffron-navy",
  "ink-blush",
];
