export const SubCategoryMapper = {
  toDTO(subCategory) {
    if (!subCategory) {
      return null;
    }

    return {
      id: subCategory.id,
      name: subCategory.name,
      categoryId: subCategory.category_id,
      isActive: subCategory.is_active,
      createdAt: subCategory.created_at,
      updatedAt: subCategory.updated_at,
    };
  },

  toDTOList(subCategories = []) {
    return subCategories.map((subCategory) =>
      SubCategoryMapper.toDTO(subCategory),
    );
  },

  toEntity(row) {
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      category_id: row.category_id,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  },

  toEntityList(rows = []) {
    return rows.map((row) => SubCategoryMapper.toEntity(row));
  },
};
