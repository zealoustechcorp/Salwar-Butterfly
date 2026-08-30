export const ProductMapper = {
  toDTO(product) {
    if (!product) return null;

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description ?? null,
      categoryId: product.category_id,
      subCategoryId: product.sub_category_id ?? null,
      basePrice: parseFloat(product.base_price),
      discountPercentage: parseFloat(product.discount_percentage),
      currentPrice: parseFloat(product.current_price),
      attributes: product.attributes ?? {},
      isFeatured: product.is_featured,
      active: product.active,
      createdAt: product.created_at,
      updatedAt: product.updated_at,
    };
  },

  toDTOList(products = []) {
    return products.map((product) => ProductMapper.toDTO(product));
  },

  toEntity(row) {
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description ?? null,
      category_id: row.category_id,
      sub_category_id: row.sub_category_id ?? null,
      base_price: row.base_price,
      discount_percentage: row.discount_percentage,
      current_price: row.current_price,
      attributes: row.attributes ?? {},
      is_featured: row.is_featured,
      active: row.active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  },

  toEntityList(rows = []) {
    return rows.map((row) => ProductMapper.toEntity(row));
  },
};
