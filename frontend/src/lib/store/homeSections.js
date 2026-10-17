/**
 * The hand-picked shelves on the home page (F-06): best sellers, festival
 * sales, collections.
 *
 * Read from `GET /storefront/getHomeSections`, which returns only the shelves
 * that are switched on and inside their dates, each with its title, the line
 * under it, its layout and colour theme, its end date (for the countdown) and
 * the ids of its on-sale pieces in the shop's order. The products themselves
 * are not in the response: the home page already holds the catalogue, and
 * the shelves are built from that (see <HomeShelves>).
 *
 * A minute's revalidation, the catalogue's own, so a festival shelf appears
 * and disappears within about a minute of its dates.
 *
 * On failure this returns an empty array, like banners.js: the home page
 * still has its automatic shelves, and a missing festival shelf is a smaller
 * loss than a home page that will not render.
 */

import { cache } from "react";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api"
).replace(/\/+$/, "");

const REVALIDATE_SECONDS = 60;

/**
 * @returns {Promise<Array<{title: string, subtitle: string|null, slug: string,
 *          layout: "festival"|"cards"|"editorial", theme: string,
 *          ends_at: string|null, product_ids: string[]}>>}
 */
export const getHomeSections = cache(async () => {
  try {
    const response = await fetch(`${API_BASE}/storefront/getHomeSections`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ["home-sections"] },
    });

    if (!response.ok) {
      console.warn(`[home sections] the API answered ${response.status}`);
      return [];
    }

    const payload = await response.json();
    const sections = payload?.data?.sections;

    return Array.isArray(sections) ? sections : [];
  } catch (error) {
    console.warn(`[home sections] could not load the sections: ${error.message}`);
    return [];
  }
});
