/**
 * What customers have sent the shop (F-06.08), as the home page prints
 * it.
 *
 * Read from `GET /storefront/getCustomerStories` — the public reader,
 * which returns a name, a quote, a photograph and the piece it is about,
 * and nothing else. The story's id, its position, the published flag and
 * the Cloudinary public id live on the admin API and never reach here.
 *
 * `product` is an object or null. Null covers both "this story names no
 * piece" and "the piece it names is no longer on sale" — the API
 * collapses those before they reach the browser, so the card has one
 * question to ask rather than two.
 *
 * On failure this returns an empty array and the home page renders no
 * rail at all. Same reasoning as banners.js and the opposite of
 * sizeCharts.js: a missing section is a page that is merely shorter,
 * while a missing size chart is a shopper picking a size with nothing to
 * pick it against. There is nothing to fall back to here and nothing
 * lost by saying less.
 */

import { cache } from "react";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api"
).replace(/\/+$/, "");

/**
 * How long a rendered page may go on showing the stories it was built
 * with, in seconds.
 *
 * Five minutes, matching the banners. A story is published once and
 * does not change afterwards, so the only thing this window delays is a
 * new one appearing.
 */
const REVALIDATE_SECONDS = 300;

/**
 * The published stories, in the order the shop chose.
 *
 * @returns {Promise<Array<{customer_name: string|null, body: string|null,
 *          image: string|null, product: {id: string, name: string}|null}>>}
 *          an empty array means the shop publishes none, or that they
 *          could not be read
 */
export const getCustomerStories = cache(async () => {
  try {
    const response = await fetch(`${API_BASE}/storefront/getCustomerStories`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ["customer-stories"] },
    });

    if (!response.ok) {
      console.warn(`[customer-stories] the API answered ${response.status}`);
      return [];
    }

    const payload = await response.json();
    const stories = payload?.data?.stories;

    // Anything but an array is an API this build does not understand.
    // Treated as none, which renders no section.
    return Array.isArray(stories) ? stories : [];
  } catch (error) {
    console.warn(`[customer-stories] could not load the stories: ${error.message}`);
    return [];
  }
});
