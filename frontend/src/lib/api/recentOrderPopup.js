/**
 * The "Someone from Chennai just bought…" pop-up on the storefront
 * (F-09.09), admin side.
 *
 * One switch and three numbers: whether it shows, how far back an order
 * may have been paid and still be shown, how long each pop-up stays on
 * screen, and the gap between pop-ups (which must be longer). The
 * first pop-up always comes 5 seconds after a page loads (fixed in
 * components/store/RecentOrderPopup.js). Which orders count is fixed
 * on the server — paid, not cancelled or refunded — and the only customer
 * detail it ever shows is the shipping city.
 *
 * Errors are the `ApiError` thrown by the shared client; a 400 carries
 * per-field messages in `error.fields`.
 */

import { api } from "./client";

/** Mirrors backend/src/config/recent_order_popup.policy.js and the CHECKs in 036. */
export const LOOKBACK_DAYS = { min: 1, max: 90, default: 7 };
/** Mirrors DISPLAY_MODE in the policy and the CHECK in 038. */
export const DISPLAY_MODE = { TIMER: "timer", UNTIL_CLOSED: "until_closed" };

/** Mirrors CLOSE_DELAY_SECONDS and the CHECK in 039. */
export const CLOSE_DELAY_SECONDS = { min: 1, max: 600, default: 5 };

export const VISIBLE_SECONDS = { min: 3, max: 30, default: 6 };
export const INTERVAL_SECONDS = { min: 10, max: 600, default: 20 };

/** Mirrors MAX_POPUP_ORDERS. */
export const MAX_POPUP_ORDERS = 10;

export function toSettings(dto) {
  return {
    enabled: Boolean(dto?.enabled),
    lookbackDays: Number(dto?.lookbackDays ?? LOOKBACK_DAYS.default),
    displayMode: dto?.displayMode === DISPLAY_MODE.UNTIL_CLOSED ? DISPLAY_MODE.UNTIL_CLOSED : DISPLAY_MODE.TIMER,
    visibleSeconds: Number(dto?.visibleSeconds ?? VISIBLE_SECONDS.default),
    intervalSeconds: Number(dto?.intervalSeconds ?? INTERVAL_SECONDS.default),
    closeDelaySeconds: Number(dto?.closeDelaySeconds ?? CLOSE_DELAY_SECONDS.default),
    updatedAt: dto?.updatedAt ?? null,
  };
}

export async function getPopupSettings({ signal } = {}) {
  return toSettings(await api.get("/recentOrderPopup/getSettings", { signal }));
}

/** A full replace of the six settings; returns what was saved. */
export async function updatePopupSettings({
  enabled,
  lookbackDays,
  displayMode,
  visibleSeconds,
  intervalSeconds,
  closeDelaySeconds,
}) {
  const data = await api.put("/recentOrderPopup/updateSettings", {
    enabled: Boolean(enabled),
    lookbackDays: Number(lookbackDays),
    displayMode,
    visibleSeconds: Number(visibleSeconds),
    intervalSeconds: Number(intervalSeconds),
    closeDelaySeconds: Number(closeDelaySeconds),
  });

  return toSettings(data);
}
