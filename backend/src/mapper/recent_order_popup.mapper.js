// src/mapper/recent_order_popup.mapper.js
//
// The recent-order pop-up (F-09.09). Two shapes, for two readers.
//
//   toSettings  the admin screen, and the timing half of the public read:
//               the switch and the three numbers.
//
//   toPublicOrder  one entry the storefront cycles through: the city, the
//               piece (name, slug for the link, photograph) and when it
//               was paid. No name, phone, email, address or order number —
//               the shop chose "Someone from <city>", and the column list
//               in storefront.repository.js is what enforces it.

import {
  INTERVAL_SECONDS,
  LOOKBACK_DAYS,
  VISIBLE_SECONDS,
} from "../config/recent_order_popup.policy.js";

export const RecentOrderPopupMapper = {
  /** A missing row (036 not run yet) reads as the defaults, switched off. */
  toSettings(row) {
    return {
      enabled: Boolean(row?.enabled),
      lookbackDays: Number(row?.lookback_days ?? LOOKBACK_DAYS.default),
      visibleSeconds: Number(row?.visible_seconds ?? VISIBLE_SECONDS.default),
      intervalSeconds: Number(row?.interval_seconds ?? INTERVAL_SECONDS.default),
      updatedAt: row?.updated_at ?? null,
    };
  },

  toPublicOrder(row) {
    return {
      city: row.city,
      product: {
        name: row.product_name,
        slug: row.product_slug,
        image: row.product_image ?? null,
      },
      orderedAt: row.ordered_at,
    };
  },
};
