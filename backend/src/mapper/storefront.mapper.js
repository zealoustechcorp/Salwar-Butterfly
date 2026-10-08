// src/mapper/storefront.mapper.js
//
// Database rows → the storefront's public read model (F-06).
//
// One deliberate inconsistency to explain, because it will otherwise read
// as an oversight: every other mapper in this project emits camelCase
// (`paymentStatus`, `createdAt`), and this one emits snake_case
// (`category_id`, `created_at`, `variant_id`).
//
// That is because the storefront's read model is not the admin API's
// model renamed. It is its own vocabulary — `in_stock`, `piece_code`,
// `category_name`, `available_sizes` are all derived on the frontend and
// have no column behind them — and the customer-facing components have
// spoken it since before this endpoint existed. Renaming the four fields
// that do come from here would leave the frontend mixing both
// conventions inside a single product object, which is worse than one
// endpoint that documents why it differs.
//
// Nothing sensitive belongs in these shapes. If a field is not something
// the shop would print on a price tag, it does not go here — see the
// repository, which is where the column list is actually enforced.

/** Percentage off, rounded — what the badge on a card shows. */
const discountPercent = (price, mrp) => {
  if (!mrp || mrp <= price) return 0;
  return Math.round((1 - price / mrp) * 100);
};

const num = (value) => (value === null || value === undefined ? null : Number(value));

export const StorefrontMapper = {
  /**
   * One product card / detail page.
   *
   * `mrp` is only set when the base price is genuinely above what is
   * being charged. Equal prices mean no discount, and rendering
   * "was ₹1850" beside "₹1850" reads as a mistake rather than an offer.
   */
  toProduct(row) {
    const price = num(row.current_price);
    const base = num(row.base_price);
    const mrp = base && base > price ? base : null;

    return {
      id: row.id,
      name: row.name,
      price,
      mrp,
      off: discountPercent(price, mrp),
      category_id: row.category_id,

      // The fit this piece is cut to — "Normal Fit", "Slim Fit" — or
      // null where the shop has not recorded one. It is the name of a
      // published chart, so the size guide beside the Buy button shows
      // that one table rather than the whole set; a null falls back to
      // the whole set, which is what every product showed before fits
      // were recorded.
      fit: row.fit ?? null,

      image: row.image,
      image2: row.image2 ?? null,
      stock: Number(row.stock) || 0,
      sizes: (row.sizes ?? []).map((size) => ({
        // The id a bag line carries and checkout orders against. For a
        // product sold in several colours this is a stand-in for the
        // first colourway — see the fold in storefront.repository.js and
        // the reason it is sound only while no swatch picker exists.
        variant_id: size.variant_id,
        size: size.size,
        // Summed across the colourways this size is sold in, so "only 2
        // left" describes the size rather than one arbitrary colour of
        // it.
        stock: Number(size.stock) || 0,
      })),

      // The colourways on sale. Empty for a product not sold by colour,
      // which is every product until an admin adds one. Carried now so
      // a card can say "in 3 colours"; the picker that lets a shopper
      // choose between them is the next pass.
      colours: (row.colours ?? []).map((colour) => ({
        name: colour.name,
        hex: colour.hex ? String(colour.hex).trim() : null,
      })),

      // F-06.08. `average` stays null when nothing has been published,
      // because zero is a rating — the worst one — and a card must be
      // able to tell "nobody has reviewed this" from "everybody hated
      // it". `count` is what decides whether stars are drawn at all.
      rating: {
        count: Number(row.rating_count) || 0,
        average: row.rating_average === null ? null : Number(row.rating_average),
      },

      created_at: row.created_at,
    };
  },

  /**
   * One published review (F-06.08).
   *
   * Four fields and a date. No customer id, no email, no `published`
   * flag — see the repository's column list, which is where that is
   * actually enforced, and the reasons it gives.
   */
  toReview(row) {
    return {
      id: row.id,
      author: row.author_name,
      rating: Number(row.rating),
      title: row.title ?? null,
      body: row.body ?? null,
      created_at: row.created_at,
    };
  },

  /**
   * The score for one piece, and its spread.
   *
   * The distribution is keyed 1–5 from a fixed list rather than from
   * whatever the query returned, so a rating nobody has given is a zero
   * the bar chart can draw rather than a hole it has to fill.
   */
  toRating(row) {
    return {
      count: Number(row?.count) || 0,
      average: Number(row?.count) ? Number(row.average) : null,
      distribution: {
        5: Number(row?.five) || 0,
        4: Number(row?.four) || 0,
        3: Number(row?.three) || 0,
        2: Number(row?.two) || 0,
        1: Number(row?.one) || 0,
      },
    };
  },

  /**
   * A category tile.
   *
   * `count` is passed in rather than read off the row — it is the number
   * of products that survived the photo filter, which only the service
   * knows.
   */
  toCategory(row, count) {
    return {
      id: row.id,
      name: row.name,
      image: row.image,
      count,
    };
  },
};
