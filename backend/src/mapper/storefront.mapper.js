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
      image: row.image,
      image2: row.image2 ?? null,
      stock: Number(row.stock) || 0,
      sizes: (row.sizes ?? []).map((size) => ({
        // The id a bag line carries and checkout orders against.
        variant_id: size.variant_id,
        size: size.size,
        stock: Number(size.stock) || 0,
      })),
      created_at: row.created_at,
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
