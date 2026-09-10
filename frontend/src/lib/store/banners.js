/**
 * The banners on the home page carousel (F-06).
 *
 * Read from `GET /storefront/getBanners` — the public reader, which
 * returns one field per slide, the image URL, in rotation order. The
 * banner's id, its position, the active flag and the Cloudinary public
 * id live on the admin API and never reach this module. That last one is
 * the handle that deletes the file, which is why the split is drawn at
 * the SQL rather than here.
 *
 * The banner set used to be a frozen array in `lib/store/shop.js`. The
 * migration that created the table seeded it from exactly those five
 * URLs, so nothing a shopper saw changed on the day this landed.
 *
 * On failure this returns an empty array rather than null, and it is the
 * one read in this directory that does not distinguish the two. There is
 * nothing for a caller to do with the difference: Hero.js has always had
 * a fallback for the case where the artwork cannot be shown — the
 * illustrated GarmentArt lockup, which is what it already rendered
 * whenever the photographs failed to load — and it renders that whether
 * the shop has taken every banner down or the API is unreachable. A page
 * that is merely drawn rather than photographed is a smaller loss than a
 * home page that will not render at all.
 */

import { cache } from "react";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api"
).replace(/\/+$/, "");

/**
 * How long a rendered page may go on showing the banners it was built
 * with, in seconds.
 *
 * Five minutes, against the catalogue's one, and for the same reason the
 * size charts take five: stock is what makes the catalogue urgent, while
 * a banner set changes when the shop changes its artwork — a few times a
 * season. The only thing this window delays is a new banner appearing,
 * and the shop puts those up deliberately rather than mid-sale.
 */
const REVALIDATE_SECONDS = 300;

/**
 * The slides the carousel is showing, in rotation order.
 *
 * `cache()` dedupes within a render, so a page and a section that both
 * ask make one request.
 *
 * @returns {Promise<Array<{image: string}>>} the slides — an empty array
 *          means the shop has taken every banner down, or that they
 *          could not be read
 */
export const getBanners = cache(async () => {
  try {
    const response = await fetch(`${API_BASE}/storefront/getBanners`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ["banners"] },
    });

    if (!response.ok) {
      console.warn(`[banners] the API answered ${response.status}`);
      return [];
    }

    const payload = await response.json();
    const banners = payload?.data?.banners;

    // Anything but an array is an API this build does not understand.
    // Treated as no banners, which the carousel already handles.
    return Array.isArray(banners) ? banners : [];
  } catch (error) {
    console.warn(`[banners] could not load the banners: ${error.message}`);
    return [];
  }
});
