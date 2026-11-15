/**
 * The "Someone from Chennai just bought…" pop-up on the storefront
 * (F-09.09), admin side.
 *
 * The switch, the look-back window, and how the pop-up times itself:
 *
 *   - display mode: stays until the shopper closes it, or a timer;
 *   - show for (seconds): timer mode only;
 *   - next pop-up after (seconds): counted from when a pop-up disappears,
 *     timer or ✕ alike, and also the wait before the first one.
 *
 * Which orders count is fixed on the server — paid, not cancelled or
 * refunded — and the only customer detail it ever shows is the city.
 *
 * Errors are the `ApiError` thrown by the shared client; a 400 carries
 * per-field messages in `error.fields`.
 */

import { api } from "./client";

/** Mirrors backend/src/config/recent_order_popup.policy.js and the CHECKs in 036/040. */
export const DISPLAY_MODE = { TIMER: "timer", UNTIL_CLOSED: "until_closed" };
export const LOOKBACK_DAYS = { min: 1, max: 90, default: 7 };
export const VISIBLE_SECONDS = { min: 3, max: 60, default: 6 };
export const GAP_SECONDS = { min: 1, max: 600, default: 5 };

/** Mirrors MAX_POPUP_ORDERS. */
export const MAX_POPUP_ORDERS = 10;

export function toSettings(dto) {
  return {
    enabled: Boolean(dto?.enabled),
    lookbackDays: Number(dto?.lookbackDays ?? LOOKBACK_DAYS.default),
    displayMode:
      dto?.displayMode === DISPLAY_MODE.UNTIL_CLOSED ? DISPLAY_MODE.UNTIL_CLOSED : DISPLAY_MODE.TIMER,
    visibleSeconds: Number(dto?.visibleSeconds ?? VISIBLE_SECONDS.default),
    gapSeconds: Number(dto?.gapSeconds ?? GAP_SECONDS.default),
    updatedAt: dto?.updatedAt ?? null,
  };
}

export async function getPopupSettings({ signal } = {}) {
  return toSettings(await api.get("/recentOrderPopup/getSettings", { signal }));
}

/** A full replace of the settings; returns what was saved. */
export async function updatePopupSettings({
  enabled,
  lookbackDays,
  displayMode,
  visibleSeconds,
  gapSeconds,
}) {
  const data = await api.put("/recentOrderPopup/updateSettings", {
    enabled: Boolean(enabled),
    lookbackDays: Number(lookbackDays),
    displayMode,
    visibleSeconds: Number(visibleSeconds),
    gapSeconds: Number(gapSeconds),
  });

  return toSettings(data);
}
