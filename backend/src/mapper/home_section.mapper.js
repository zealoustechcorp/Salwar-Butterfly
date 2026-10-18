// src/mapper/home_section.mapper.js
//
// The two home page sections (F-06).
//
// Two shapes, for two readers.
//
//   toDTO     the admin screen: the section's key (slug), name,
//             description, and its picked pieces with their on-sale flag,
//             so the screen can warn about a pick nobody can buy.
//
//   toPublic  the home page: the name, the description, the key and the
//             ids of the pieces to show, in order. Product ids are already
//             public — they are in the catalogue and every product URL —
//             and the storefront builds the cards from the catalogue it has
//             already loaded.

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

    const products = Array.isArray(row.products) ? row.products : [];

    return {
      slug: row.slug,
      title: row.title,
      subtitle: cleaned(row.subtitle),
      productCount: Number(row.product_count ?? products.length),
      productIds: products.map((product) => product.id),
      products: products.map(toProduct),
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
      product_ids: Array.isArray(row.product_ids) ? row.product_ids : [],
    };
  },

  toPublicList(rows = []) {
    return rows.map((row) => HomeSectionMapper.toPublic(row));
  },
};
