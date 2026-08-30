/**
 * What shoppers have said about a piece (F-06.08).
 *
 * Read from `GET /storefront/getProductReviews/:id` — the public reader,
 * which returns an author name, a rating, a headline, a body and a date,
 * and nothing else. The reviewer's account, their email and the shop's
 * published/hidden flag live on the admin API and never reach this
 * module.
 *
 * Reviews are written by the shop, on an admin-only page, from what
 * customers say on WhatsApp and on the phone (F-11.06). There is no
 * shopper-facing form and no endpoint behind one.
 *
 * Called from a server component, like the catalogue next door.
 *
 * One difference from catalogue.js worth stating: a failure here returns
 * null rather than throwing. The catalogue *is* the page — a shop with
 * no catalogue is an error. Reviews are a section of a page that is
 * otherwise complete, and taking a working product page down because a
 * review query timed out would be the wrong trade.
 */

import { cache } from "react";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api"
).replace(/\/+$/, "");

/**
 * How long a rendered page may go on showing the reviews it was built
 * with, in seconds.
 *
 * Five minutes, against the catalogue's one. Stock is what makes the
 * catalogue urgent; a review is written once and then never changes, so
 * the only thing this window delays is a newly published one appearing
 * — and the shop publishes them in batches, not live.
 */
const REVALIDATE_SECONDS = 300;

export const EMPTY_REVIEWS = {
  rating: { count: 0, average: null, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
  reviews: [],
};

/**
 * Published reviews for one piece, newest first.
 *
 * `cache()` dedupes within a render, so a page that shows the score at
 * the top and the reviews further down makes one request.
 *
 * @returns {Promise<{rating: object, reviews: object[]}|null>} null when
 *          the reviews could not be read — the caller renders no section
 */
export const getProductReviews = cache(async (productId) => {
  const id = String(productId ?? "");
  if (!id) return null;

  try {
    const response = await fetch(
      `${API_BASE}/storefront/getProductReviews/${encodeURIComponent(id)}`,
      { next: { revalidate: REVALIDATE_SECONDS, tags: ["reviews"] } },
    );

    // A 404 means the piece is not on sale, which the page itself has
    // already established is untrue — so it is as unexpected as a 500,
    // and handled the same way: no section rather than a broken one.
    if (!response.ok) return null;

    const payload = await response.json();

    return payload?.data ?? null;
  } catch (error) {
    console.warn(`[reviews] could not load reviews for ${id}: ${error.message}`);
    return null;
  }
});
