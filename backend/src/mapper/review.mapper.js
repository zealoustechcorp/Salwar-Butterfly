// src/mapper/review.mapper.js

import { RATINGS } from "../config/review.policy.js";

/**
 * A review, with the product it is about nested rather than flattened.
 *
 * Same shape as the inventory line next door: a client can hand
 * `row.product` straight to a product tile instead of unpicking half a
 * dozen `product`-prefixed keys.
 *
 * `customer` is null for most rows and that is the normal case, not a
 * missing join — the shop publishes what people say on WhatsApp, and
 * most of them have no account. Where there is one, the email travels
 * with it because the admin screen is the only place it is shown and
 * it is how the shop recognises a repeat buyer.
 */
export const ReviewMapper = {
  toDTO(row) {
    if (!row) return null;

    return {
      id: row.id,
      productId: row.product_id,

      // The name as published. Never read from the customer row — see
      // the migration for why a snapshot is the point.
      authorName: row.author_name,

      rating: Number(row.rating),
      title: row.title ?? null,
      body: row.body ?? null,
      published: row.published,

      product: {
        id: row.product_id,
        name: row.product_name,
        slug: row.product_slug,
        active: row.product_active,
        imageUrl: row.product_image_url ?? null,
      },

      customer: row.customer_id
        ? {
            id: row.customer_id,
            name: row.customer_name ?? null,
            email: row.customer_email ?? null,
          }
        : null,

      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  toDTOList(rows = []) {
    return rows.map((row) => ReviewMapper.toDTO(row));
  },

  /**
   * The score, and how it breaks down.
   *
   * `average` is over published reviews only — it is what a shopper
   * would see, and folding in the hidden ones would print a figure that
   * matches none of the stars underneath it. `total` counts everything,
   * because the admin is curating and needs to know what is there.
   *
   * The distribution is keyed 1–5 from the policy's list rather than
   * from whatever the query happened to return, so a rating nobody has
   * given yet is a zero rather than a hole the client has to fill.
   */
  toRatingSummary(row) {
    const names = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five" };

    return {
      total: Number(row?.total_reviews ?? 0),
      published: Number(row?.published_reviews ?? 0),
      hidden: Number(row?.hidden_reviews ?? 0),

      // NUMERIC arrives from pg as a string; a star bar cannot do
      // arithmetic on "4.3".
      average: Number(row?.average_rating ?? 0),

      distribution: Object.fromEntries(
        RATINGS.map((rating) => [rating, Number(row?.[names[rating]] ?? 0)]),
      ),
    };
  },
};
