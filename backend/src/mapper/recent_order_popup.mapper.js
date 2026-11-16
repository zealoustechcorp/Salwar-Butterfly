// src/mapper/recent_order_popup.mapper.js
//
// The recent-order pop-up (F-09.09). Two shapes, for two readers.
//
//   toSettings  the admin screen, and the timing half of the public read:
//               the switch, look-back, mode and two timings.
//
//   toPublicOrder  one entry the storefront cycles through: the city, the
//               piece (name, slug for the link, photograph), the order's
//               other pieces ("+ N more") and when it was paid. No name,
//               phone, email, address or order number —
//               the shop chose "Someone from <city>", and the column list
//               in storefront.repository.js is what enforces it.

import {
  DEFAULT_DISPLAY_MODE,
  DISPLAY_MODES,
  GAP_SECONDS,
  LOOKBACK_DAYS,
  VISIBLE_SECONDS,
} from "../config/recent_order_popup.policy.js";

export const RecentOrderPopupMapper = {
  /** A missing row (036 not run yet) reads as the defaults, switched off. */
  toSettings(row) {
    return {
      enabled: Boolean(row?.enabled),
      lookbackDays: Number(row?.lookback_days ?? LOOKBACK_DAYS.default),
      displayMode: DISPLAY_MODES.includes(row?.display_mode)
        ? row.display_mode
        : DEFAULT_DISPLAY_MODE,
      visibleSeconds: Number(row?.visible_seconds ?? VISIBLE_SECONDS.default),
      gapSeconds: Number(row?.gap_seconds ?? GAP_SECONDS.default),
      updatedAt: row?.updated_at ?? null,
    };
  },

  /**
   * One card. `moreCount` is every other on-sale piece in the order; `more`
   * lists the first few of them (MAX_POPUP_MORE_ITEMS). A one-piece order
   * sends 0 and [] and draws exactly as before.
   */
  toPublicOrder(row) {
    const more = (Array.isArray(row.more) ? row.more : [])
      .filter((item) => item?.slug && item?.name)
      .map((item) => ({ name: item.name, slug: item.slug, image: item.image ?? null }));

    return {
      city: row.city,
      product: {
        name: row.product_name,
        slug: row.product_slug,
        image: row.product_image ?? null,
      },
      moreCount: Math.max(Number(row.more_count) || 0, more.length),
      more,
      orderedAt: row.ordered_at,
    };
  },

  /**
   * No city twice in a row. Orders arrive newest first; when the next one
   * is from the same city as the one before it, the next order from a
   * different city moves ahead of it. Nothing is dropped, and when only
   * one city is left the rest keep their order.
   */
  spreadCities(orders) {
    const pool = [...orders];
    const out = [];

    while (pool.length) {
      const last = out[out.length - 1];
      let index = last ? pool.findIndex((order) => order.city !== last.city) : 0;
      if (index === -1) index = 0;
      out.push(pool.splice(index, 1)[0]);
    }

    return out;
  },
};
