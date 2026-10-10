// src/mapper/category.mapper.js

// ============================================================
// CATEGORY MAPPER
// ============================================================

export const CategoryMapper = {
  // ==========================================================
  // ENTITY -> RESPONSE DTO
  // ==========================================================

  toDTO(category) {
    if (!category) {
      return null;
    }

    return {
      id: category.id,

      name: category.name,

      slug: category.slug,

      description: category.description ?? null,

      // R2 public URL
      image: category.image ?? null,

      // R2 object key
      imagePublicId: category.image_public_id ?? null,

      // JSONB size-fit matrices, as stored
      fits: category.fits ?? null,

      active: category.active,

      createdAt: category.created_at,

      updatedAt: category.updated_at,
    };
  },

  // ==========================================================
  // ENTITY LIST -> RESPONSE DTO LIST
  // ==========================================================

  toDTOList(categories = []) {
    return categories.map((category) => CategoryMapper.toDTO(category));
  },

  // ==========================================================
  // DATABASE ROW -> INTERNAL ENTITY
  // ==========================================================

  toEntity(row) {
    if (!row) {
      return null;
    }

    return {
      id: row.id,

      name: row.name,

      slug: row.slug,

      description: row.description ?? null,

      image: row.image ?? null,

      image_public_id: row.image_public_id ?? null,

      fits: row.fits ?? null,

      active: row.active,

      deleted_at: row.deleted_at ?? null,

      created_at: row.created_at,

      updated_at: row.updated_at,
    };
  },

  // ==========================================================
  // DATABASE ROW LIST -> INTERNAL ENTITY LIST
  // ==========================================================

  toEntityList(rows = []) {
    return rows.map((row) => CategoryMapper.toEntity(row));
  },
};
