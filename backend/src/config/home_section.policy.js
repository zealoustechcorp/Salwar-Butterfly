// src/config/home_section.policy.js
//
// The one definition of what a home page shelf may be (F-06).
//
// Mirrors customer_story.policy.js: the validator and the service refuse
// on these, and 028_create_home_sections.sql repeats what it can as CHECK
// constraints.

/** Matches home_sections.title VARCHAR(80). A shelf heading, not a sentence. */
export const MAX_TITLE_LENGTH = 80;

/** Matches home_sections.subtitle VARCHAR(200). */
export const MAX_SUBTITLE_LENGTH = 200;

/** Matches home_sections.slug VARCHAR(100). */
export const MAX_SLUG_LENGTH = 100;

/** Lower-case words joined by single hyphens — chk_home_sections_slug. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The most shelves the table may hold, live or not.
 *
 * Old festival shelves are kept switched off for next year, so this is
 * room for a few seasons of them, and still few enough for the admin
 * screen to list without a pager.
 */
export const MAX_SECTIONS = 30;

/**
 * The most pieces one shelf may hold.
 *
 * The home page shows the first ten; the rest are for the shelf's own
 * page behind "View all".
 */
export const MAX_PRODUCTS_PER_SECTION = 40;

/** How a shelf is drawn — chk_home_sections_layout. */
export const LAYOUTS = ["festival", "cards", "editorial"];

/** The festival band's colour presets — chk_home_sections_theme. */
export const THEMES = [
  "maroon-gold",
  "turmeric-leaf",
  "emerald",
  "saffron-navy",
  "ink-blush",
];
