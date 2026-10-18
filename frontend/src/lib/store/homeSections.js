/**
 * The two hand-picked sections on the home page (F-06): Best sellers, and the
 * custom section the shop renames for whatever is running.
 *
 * Read from `GET /storefront/getHomeSections`, which returns each section
 * that has on-sale pieces, with its name, its description, its key and the
 * ids of those pieces in the shop's order. The products themselves
 * are not in the response: the home page already holds the catalogue, and
 * the sections are built from that (see <CardShelf>).
 *
 * A minute's revalidation, the catalogue's own, so a change made in the admin
 * shows within about a minute.
 *
 * On failure this returns an empty array, like banners.js: the home page
 * still has Just landed, and a missing section is a smaller
 * loss than a home page that will not render.
 */

import { cache } from "react";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api"
).replace(/\/+$/, "");

const REVALIDATE_SECONDS = 60;

/**
 * @returns {Promise<Array<{title: string, subtitle: string|null, slug: string,
 *          product_ids: string[]}>>}
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
