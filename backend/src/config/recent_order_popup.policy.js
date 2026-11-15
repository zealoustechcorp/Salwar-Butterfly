// src/config/recent_order_popup.policy.js
//
// The one definition of what the recent-order pop-up may be set to
// (F-09.09).
//
// The validator refuses on these, and 036_create_recent_order_popup.sql
// repeats them as CHECK constraints. Changing a range means changing both.
// Mirrored for the admin screen in frontend/src/lib/api/recentOrderPopup.js.

/**
 * How a card leaves the screen (038).
 *
 *   timer         hides itself after VISIBLE_SECONDS; the next comes
 *                 INTERVAL_SECONDS after the last one appeared.
 *   until_closed  stays until the shopper clicks the ✕; the next comes
 *                 CLOSE_DELAY_SECONDS later. The two timings are kept but unused.
 */
export const DISPLAY_MODE = { TIMER: "timer", UNTIL_CLOSED: "until_closed" };
export const DISPLAY_MODES = Object.values(DISPLAY_MODE);
export const DEFAULT_DISPLAY_MODE = DISPLAY_MODE.TIMER;

/**
 * Seconds after the shopper closes a card (the ✕) before the next appears,
 * in both display modes (039). The first card after a page loads is a
 * fixed 5 seconds and not this.
 */
export const CLOSE_DELAY_SECONDS = { min: 1, max: 600, default: 5 };

/** How far back an order may have been paid and still be shown, in days. */
export const LOOKBACK_DAYS = { min: 1, max: 90, default: 7 };

/** Seconds each pop-up stays on screen before it hides itself. */
export const VISIBLE_SECONDS = { min: 3, max: 30, default: 6 };

/**
 * Seconds from one pop-up appearing to the next.
 *
 * Must also be longer than VISIBLE_SECONDS, so one pop-up has gone before
 * the next arrives. The validator checks that, and so does a CHECK in 036.
 */
export const INTERVAL_SECONDS = { min: 10, max: 600, default: 20 };

/**
 * The most orders the pop-up cycles through. Fixed, not a setting: a
 * shopper rarely stays for more than a handful, and the cap keeps the
 * public read small.
 */
export const MAX_POPUP_ORDERS = 10;
