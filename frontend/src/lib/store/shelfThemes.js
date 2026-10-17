/**
 * The home page shelves' layouts and colour themes (F-06).
 *
 * Mirrors LAYOUTS and THEMES in backend/src/config/home_section.policy.js,
 * which the API and chk_home_sections_layout / _theme refuse on. Shared by
 * the storefront, which draws the shelves, and the admin screen, which
 * offers the same choices with the same names and swatches.
 */

export const SHELF_LAYOUTS = [
  {
    id: "festival",
    label: "Festival / Sale",
    hint: "A coloured band with the title, a countdown to the end date and arch-framed pieces. For Diwali, Pongal, Eid, sales.",
  },
  {
    id: "cards",
    label: "Product cards",
    hint: "Plain product cards with a Shop now button. For Best sellers and everyday collections.",
  },
  {
    id: "editorial",
    label: "Editorial",
    hint: "The first picked piece as a large picture beside a slider of the rest. For edits like Wedding or Office Wear.",
  },
];

/**
 * The festival band's colour presets.
 *
 * `bg` is the band, `ink` the text on it, `accent` the title, prices and
 * frames, `soft` the line under the title. Each pair was chosen to read on
 * its own background.
 */
export const SHELF_THEMES = [
  { id: "maroon-gold", label: "Maroon & gold", bg: "#3e1a18", ink: "#f8e9de", accent: "#e2bd8f", soft: "#e9d3c6" },
  { id: "turmeric-leaf", label: "Turmeric & leaf green", bg: "#2f4a1e", ink: "#fbf4dc", accent: "#f2c14e", soft: "#e6e2c4" },
  { id: "emerald", label: "Emerald", bg: "#1f4a43", ink: "#f2f7f2", accent: "#e8d6a8", soft: "#cfe0d8" },
  { id: "saffron-navy", label: "Saffron & navy", bg: "#1e2d55", ink: "#f6f2ea", accent: "#f19a3e", soft: "#d5d9e8" },
  { id: "ink-blush", label: "Ink & blush", bg: "#2b1413", ink: "#fbeee8", accent: "#d49a9b", soft: "#ead2cc" },
];

export const themeFor = (id) => SHELF_THEMES.find((theme) => theme.id === id) ?? SHELF_THEMES[0];
