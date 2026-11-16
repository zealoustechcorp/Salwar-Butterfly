// src/config/recent_order_popup.policy.js
//
// The one definition of what the recent-order pop-up may be set to
// (F-09.09). The validator refuses on these; 036/040 repeat them as CHECK
// constraints. Mirrored for the admin screen in
// frontend/src/lib/api/recentOrderPopup.js.

/**
 * How a pop-up leaves the screen.
 *
 *   until_closed  stays until the shopper clicks the ✕
 *   timer         hides itself after VISIBLE_SECONDS
 */
export const DISPLAY_MODE = { TIMER: "timer", UNTIL_CLOSED: "until_closed" };
export const DISPLAY_MODES = Object.values(DISPLAY_MODE);
export const DEFAULT_DISPLAY_MODE = DISPLAY_MODE.TIMER;

/** Only orders paid in the last N days are shown. */
export const LOOKBACK_DAYS = { min: 1, max: 90, default: 7 };

/** How long a pop-up shows, in timer mode only. */
export const VISIBLE_SECONDS = { min: 3, max: 60, default: 6 };

/**
 * How long after a pop-up disappears — its timer ran out or the shopper
 * clicked ✕, the same either way — before the next one. Also the wait
 * before the first pop-up after a page loads.
 */
export const GAP_SECONDS = { min: 1, max: 600, default: 5 };

/** The most orders the pop-up cycles through. Fixed, not a setting. */
export const MAX_POPUP_ORDERS = 10;

/**
 * An order with several pieces is still one card: it names the first and
 * adds "+ N more". Opening that lists at most this many of the others; the
 * card counts the rest ("and 2 more pieces in this order"). Fixed.
 */
export const MAX_POPUP_MORE_ITEMS = 3;
