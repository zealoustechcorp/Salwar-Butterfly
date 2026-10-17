// src/mapper/home_section.mapper.js
//
// The hand-picked shelves on the home page (F-06).
//
// Two shapes, for two readers.
//
//   toDTO     the admin screen: the whole row, whether it is live right
//             now, and — on a single shelf — the picked pieces with their
//             on-sale flag, so the screen can warn about a pick nobody can
//             buy.
//
//   toPublic  the home page: the title, the line under it, the link name,
//             the layout and theme, the end date (for the countdown) and
//             the ids of the pieces to show, in order. No shelf id, no
//             position, no active flag, no start date. Product ids are already
//             public — they are in the catalogue and every product URL —
//             and the storefront builds the cards from the catalogue it
//             has already loaded.

const cleaned = (value) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length ? text : null;
};

const toProduct = (row) => ({
  id: row.id,
  name: row.name,
  slug: row.slug ?? null,
  active: Boolean(row.active),
  price: row.current_price === null ? null : Number(row.current_price),
});

export const HomeSectionMapper = {
  toDTO(row) {
    if (!row) return null;

    return {
      id: row.id,
      title: row.title,
      subtitle: cleaned(row.subtitle),
      slug: row.slug,
      startsAt: row.starts_at ?? null,
      endsAt: row.ends_at ?? null,
      position: Number(row.position),
      active: Boolean(row.active),
      layout: row.layout,
      theme: row.theme,
      isLive: Boolean(row.is_live),
      productCount: Number(row.product_count ?? 0),
      // Only a single-shelf read carries the picks; the list does not.
      ...(Array.isArray(row.products)
        ? {
            productIds: row.products.map((product) => product.id),
            products: row.products.map(toProduct),
          }
        : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  toDTOList(rows = []) {
    return rows.map((row) => HomeSectionMapper.toDTO(row));
  },

  toPublic(row) {
    if (!row) return null;

    return {
      title: row.title,
      subtitle: cleaned(row.subtitle),
      slug: row.slug,
      layout: row.layout,
      theme: row.theme,
      // The countdown's target. Only the end is public: the start has
      // already passed for any shelf this read returns.
      ends_at: row.ends_at ?? null,
      product_ids: Array.isArray(row.product_ids) ? row.product_ids : [],
    };
  },

  toPublicList(rows = []) {
    return rows.map((row) => HomeSectionMapper.toPublic(row));
  },
};
