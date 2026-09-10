// src/mapper/customer_story.mapper.js
//
// What customers have sent the shop (F-06.08).
//
// Two shapes, for two readers.
//
//   toDTO     the admin screen. The whole row, plus the linked product's
//             name and whether it is still on sale — which is the thing
//             the screen needs in order to warn that a card points at a
//             piece nobody can buy.
//
//   toPublic  the home page. What is printed on a card, and nothing
//             else: no story id, no position, no published flag, and
//             above all no `image_public_id`, which is the handle that
//             deletes the file off Cloudinary.
//
// The product is the one field that is *narrowed* rather than dropped.
// A product id is already public — it is in the catalogue and in every
// product URL — and it is what makes the card a link. What the public
// shape will not carry is a link to a piece that has been taken off
// sale: `product_active` decides that here, so the storefront never has
// to.

const cleaned = (value) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length ? text : null;
};

export const CustomerStoryMapper = {
  /** One story, as the admin screen manages it. */
  toDTO(row) {
    if (!row) return null;

    return {
      id: row.id,

      customerName: cleaned(row.customer_name),
      body: cleaned(row.body),

      image: row.image ?? null,
      imagePublicId: row.image_public_id ?? null,

      productId: row.product_id ?? null,
      productName: cleaned(row.product_name),
      // Null rather than false when there is no product at all: the
      // screen shows a warning for `false`, and "this story names no
      // piece" must not read as "the piece is gone".
      productActive:
        row.product_id === null || row.product_id === undefined
          ? null
          : Boolean(row.product_active),

      position: Number(row.position),
      published: Boolean(row.published),

      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  toDTOList(rows = []) {
    return rows.map((row) => CustomerStoryMapper.toDTO(row));
  },

  /**
   * One card, as the home page renders it.
   *
   * `product` is an object or null rather than two loose fields, because
   * null is the case the card actually branches on — a story with a
   * product is a link, one without is not — and a pair of fields that
   * must be checked together is a pair that eventually is not.
   */
  toPublic(row) {
    if (!row) return null;

    const linkable = Boolean(row.product_id) && Boolean(row.product_active);

    return {
      customer_name: cleaned(row.customer_name),
      body: cleaned(row.body),
      image: row.image ?? null,
      product: linkable
        ? { id: row.product_id, name: cleaned(row.product_name) }
        : null,
    };
  },

  toPublicList(rows = []) {
    return rows.map((row) => CustomerStoryMapper.toPublic(row));
  },
};
