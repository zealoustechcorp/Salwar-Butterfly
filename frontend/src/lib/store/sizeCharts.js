/**
 * The size charts the shop publishes (F-06).
 *
 * Read from `GET /storefront/getSizeCharts` — the public reader, which
 * returns a fit, a title, what the numbers measure, a unit and the
 * table. The chart's id, the order the shop chose to print them in and
 * the published flag live on the admin API and never reach this module.
 *
 * Charts are edited by the shop on an admin-only page. They used to be
 * two hardcoded objects in `lib/sizing.js`; the migration that created
 * the table seeded it from exactly those numbers, so nothing a shopper
 * reads changed on the day this landed.
 *
 * Called from the storefront layout, once per render, because the chart
 * dialog opens from four places — the product page, every product tile,
 * the bag and the account page — and only the layout is above all four.
 *
 * On failure this returns null and the caller falls back to the copy in
 * `lib/sizing.js`. That is the opposite of what reviews.js does with a
 * failure, and deliberately: a missing review section is a page that is
 * merely shorter, while a missing size chart is a shopper picking a size
 * with nothing to pick it against. The fallback numbers are the seeded
 * ones, so serving them is serving a chart that was true.
 */

import { cache } from "react";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api"
).replace(/\/+$/, "");

/**
 * How long a rendered page may go on showing the charts it was built
 * with, in seconds.
 *
 * Five minutes, against the catalogue's one. Stock is what makes the
 * catalogue urgent; a size chart changes when the shop reprints a card,
 * which is a few times a year. The only thing this window delays is a
 * correction appearing, and the shop makes those deliberately rather
 * than in the middle of a sale.
 */
const REVALIDATE_SECONDS = 300;

/**
 * The published charts, in the order the shop prints them.
 *
 * `cache()` dedupes within a render, so a layout that fetches this and a
 * page that asks again make one request.
 *
 * @returns {Promise<Array<object>|null>} the charts — an empty array is a
 *          real answer, meaning the shop has withdrawn them all — or
 *          null when they could not be read at all
 */
export const getSizeCharts = cache(async () => {
  try {
    const response = await fetch(`${API_BASE}/storefront/getSizeCharts`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ["size-charts"] },
    });

    if (!response.ok) return null;

    const payload = await response.json();
    const charts = payload?.data?.charts;

    // An array, including an empty one, is the answer. Anything else is
    // an API this build does not understand, which is a failure and has
    // to be told apart from "the shop publishes no charts".
    return Array.isArray(charts) ? charts : null;
  } catch (error) {
    console.warn(`[size-charts] could not load the size charts: ${error.message}`);
    return null;
  }
});
