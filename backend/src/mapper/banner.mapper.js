// src/mapper/banner.mapper.js
//
// The home page carousel (F-06).
//
// Two shapes, for two readers, and the difference is the point of the
// file.
//
//   toDTO     the admin screen. Carries the id, the position, the active
//             flag and the timestamps — everything the screen needs to
//             list, reorder, hide and delete a slide.
//
//   toPublic  the storefront. Carries the image URL, and the piece the
//             slide links to where it names one.
//
// The public shape was one field until 020, and it is worth saying why
// it is a mapper rather than a `rows.map(r => r.image)` in the service.
// The three fields it drops are the three a public reader must not have:
// `id` invites a client to start sending it back, `active` would tell an
// anonymous reader how many banners the shop has taken down, and
// `image_public_id` is the handle that deletes the file off R2.
// That last one is not a leak of taste — it is the destructive key,
// printed on an endpoint with no token in front of it.
//
// `product` is the one thing 020 added to the public side, and the note
// on toPublic below is why it is not a fourth exception to that rule.

/** An empty or whitespace-only column is nothing to print. */
const cleaned = (value) => {
  const text = String(value ?? "").trim();

  return text.length > 0 ? text : null;
};

export const BannerMapper = {
  /** One banner, as the admin screen manages it. */
  toDTO(row) {
    if (!row) return null;

    return {
      id: row.id,

      image: row.image,
      imagePublicId: row.image_public_id,

      position: Number(row.position),
      active: Boolean(row.active),

      // The piece this slide links to, as three separate fields rather
      // than an object — the admin screen edits the id, prints the name
      // and warns on the flag, and they are answers to three different
      // questions. Mirrors CustomerStoryMapper.toDTO.
      productId: row.product_id ?? null,
      productName: cleaned(row.product_name),
      // null means "names no piece"; false means "names one that is off
      // sale". The screen shows a warning only for the second, so the
      // two must stay distinguishable.
      productActive: row.product_id ? Boolean(row.product_active) : null,

      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  toDTOList(rows = []) {
    return rows.map((row) => BannerMapper.toDTO(row));
  },

  /**
   * One slide, as the home page renders it.
   *
   * An object rather than a bare string, even when it held one field.
   * The carousel keys its slides and its dots by what this returns, and
   * a shape with a name on it is what let `product` arrive in 020
   * without every caller changing at once — which is the second field
   * that note was written in anticipation of.
   *
   * `product` is an object or null, and null covers two cases the
   * browser has no reason to tell apart: the slide names no piece, and
   * the piece it names is off sale. Collapsing them here rather than on
   * the client is what leaves <Hero> one question to ask — exactly the
   * split CustomerStoryMapper already makes.
   *
   * A product id on an endpoint with no token is not a disclosure: ids
   * are already in the catalogue this same reader serves, and in every
   * product URL on the site. That is what separates it from
   * `image_public_id`, which is a destructive key and stays behind the
   * admin token.
   */
  toPublic(row) {
    if (!row) return null;

    const linkable = Boolean(row.product_id) && Boolean(row.product_active);

    return {
      image: row.image,
      product: linkable
        ? { id: row.product_id, name: cleaned(row.product_name) }
        : null,
    };
  },

  toPublicList(rows = []) {
    return rows.map((row) => BannerMapper.toPublic(row));
  },
};
