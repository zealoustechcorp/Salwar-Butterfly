import { query } from "../config/db.js";
import { logger } from "../utils/logger.js";

const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  NOT_NULL_VIOLATION: "23502",
};

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Product repository error: ${operation}`, {
    operation,
    ...context,
    code: error.code,
    constraint: error.constraint,
    message: error.message,
  });

  if (
    error.code === PG_ERROR_CODES.UNIQUE_VIOLATION &&
    error.constraint === "products_slug_unique"
  ) {
    const err = new Error("PRODUCT_SLUG_EXISTS");
    err.code = "PRODUCT_SLUG_EXISTS";
    return err;
  }

  if (error.code === PG_ERROR_CODES.FOREIGN_KEY_VIOLATION) {
    const err = new Error("PRODUCT_FOREIGN_KEY_VIOLATION");
    err.code = "PRODUCT_FOREIGN_KEY_VIOLATION";
    return err;
  }

  return error;
};

export const ProductRepository = {
  async create({
    categoryId,
    subCategoryId = null,
    name,
    slug,
    description = null,
    basePrice,
    discountPercentage = 0,
    currentPrice,
    isFeatured = false,
    active = true,
  }) {
    const text = `
      INSERT INTO products (
        category_id,
        sub_category_id,
        name,
        slug,
        description,
        base_price,
        discount_percentage,
        current_price,
        is_featured,
        active,
        created_at,
        updated_at
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *
    `;

    try {
      const result = await query(text, [
        categoryId,
        subCategoryId,
        name,
        slug,
        description,
        basePrice,
        discountPercentage,
        currentPrice,
        isFeatured,
        active,
      ]);

      logger.info("Product created successfully", {
        productId: result.rows[0]?.id,
        slug,
        categoryId,
      });

      return result.rows[0];
    } catch (error) {
      throw handleDatabaseError(error, "create", { slug, categoryId });
    }
  },

  async bulkAdd(categoryId, productsData) {
    if (!Array.isArray(productsData) || productsData.length === 0) {
      throw new Error("BULK_ADD_EMPTY_ARRAY");
    }

    const values = [];
    let paramIndex = 1;
    const placeholders = productsData
      .map(() => {
        const ph = `($${paramIndex}::uuid, $${paramIndex + 1}::uuid, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, NOW(), NOW())`;
        paramIndex += 10;
        return ph;
      })
      .join(",");

    productsData.forEach((p) => {
      values.push(
        categoryId,
        p.subCategoryId || null,
        p.name,
        p.slug,
        p.description || null,
        p.basePrice,
        p.discountPercentage || 0,
        p.currentPrice,
        p.isFeatured || false,
        p.active !== false,
      );
    });

    const text = `
      INSERT INTO products (
        category_id,
        sub_category_id,
        name,
        slug,
        description,
        base_price,
        discount_percentage,
        current_price,
        is_featured,
        active,
        created_at,
        updated_at
      )
      VALUES ${placeholders}
      RETURNING *
    `;

    try {
      const result = await query(text, values);

      logger.info("Products bulk added successfully", {
        categoryId,
        count: result.rows.length,
      });

      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "bulkAdd", { categoryId });
    }
  },

  async bulkUpdateCategoryByIds(productIds, categoryId) {
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return 0;
    }

    const placeholders = productIds.map((_, i) => `$${i + 1}::uuid`).join(",");

    const text = `
      UPDATE products
      SET category_id = $${productIds.length + 1}::uuid, updated_at = NOW()
      WHERE id IN (${placeholders})
      RETURNING id
    `;

    try {
      const result = await query(text, [...productIds, categoryId]);

      logger.info("Products bulk updated with category", {
        categoryId,
        updated: result.rowCount,
      });

      return result.rowCount || 0;
    } catch (error) {
      throw handleDatabaseError(error, "bulkUpdateCategoryByIds", {
        categoryId,
        productCount: productIds.length,
      });
    }
  },

  async findById(id) {
    const text = `
      SELECT * FROM products
      WHERE id = $1::uuid
      LIMIT 1
    `;

    try {
      const result = await query(text, [id]);
      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findById", { productId: id });
    }
  },

  async findBySlug(slug) {
    const text = `
      SELECT * FROM products
      WHERE slug = $1
      LIMIT 1
    `;

    try {
      const result = await query(text, [slug]);
      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findBySlug", { slug });
    }
  },

  async findAll({
    page = 1,
    limit = 20,
    categoryId = null,
    activeOnly = false,
  } = {}) {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (safePage - 1) * safeLimit;

    let whereClause = "WHERE 1=1";
    const values = [];

    if (categoryId) {
      whereClause += ` AND category_id = $${values.length + 1}::uuid`;
      values.push(categoryId);
    }

    if (activeOnly) {
      whereClause += ` AND active = true`;
    }

    const text = `
      SELECT * FROM products
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}
    `;

    const countText = `
      SELECT COUNT(*)::INTEGER AS count FROM products ${whereClause}
    `;

    try {
      const result = await query(text, [...values, safeLimit, offset]);
      const countResult = await query(countText, values);

      return {
        rows: result.rows,
        total: countResult.rows[0]?.count ?? 0,
      };
    } catch (error) {
      throw handleDatabaseError(error, "findAll", {
        page: safePage,
        categoryId,
      });
    }
  },

  async countByCategoryId(categoryId) {
    const text = `
      SELECT COUNT(*)::INTEGER AS count
      FROM products
      WHERE category_id = $1::uuid AND active = true
    `;

    try {
      const result = await query(text, [categoryId]);
      return result.rows[0]?.count ?? 0;
    } catch (error) {
      throw handleDatabaseError(error, "countByCategoryId", { categoryId });
    }
  },

  async update(productId, updateData) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (updateData.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updateData.name);
    }

    if (updateData.slug !== undefined) {
      fields.push(`slug = $${paramIndex++}`);
      values.push(updateData.slug);
    }

    if (updateData.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updateData.description);
    }

    if (updateData.basePrice !== undefined) {
      fields.push(`base_price = $${paramIndex++}`);
      values.push(updateData.basePrice);
    }

    if (updateData.discountPercentage !== undefined) {
      fields.push(`discount_percentage = $${paramIndex++}`);
      values.push(updateData.discountPercentage);
    }

    if (updateData.currentPrice !== undefined) {
      fields.push(`current_price = $${paramIndex++}`);
      values.push(updateData.currentPrice);
    }

    if (updateData.isFeatured !== undefined) {
      fields.push(`is_featured = $${paramIndex++}`);
      values.push(updateData.isFeatured);
    }

    if (updateData.active !== undefined) {
      fields.push(`active = $${paramIndex++}`);
      values.push(updateData.active);
    }

    if (updateData.subCategoryId !== undefined) {
      fields.push(`sub_category_id = $${paramIndex++}::uuid`);
      values.push(updateData.subCategoryId);
    }

    if (fields.length === 0) {
      throw new Error("No product fields provided for update");
    }

    fields.push(`updated_at = NOW()`);
    values.push(productId);

    const text = `
      UPDATE products
      SET ${fields.join(", ")}
      WHERE id = $${paramIndex}::uuid
      RETURNING *
    `;

    try {
      const result = await query(text, values);

      if (result.rowCount === 0) {
        const error = new Error("Product not found");
        error.code = "PRODUCT_NOT_FOUND";
        throw error;
      }

      logger.info("Product updated successfully", { productId });
      return result.rows[0];
    } catch (error) {
      throw handleDatabaseError(error, "update", { productId });
    }
  },

  async updateStatus(id, active) {
    const text = `
      UPDATE products
      SET active = $1, updated_at = NOW()
      WHERE id = $2::uuid
      RETURNING *
    `;

    try {
      const result = await query(text, [active, id]);
      if (result.rowCount === 0) return null;

      logger.info("Product status updated", { productId: id, active });
      return result.rows[0];
    } catch (error) {
      throw handleDatabaseError(error, "updateStatus", { productId: id });
    }
  },

  async delete(id) {
    const text = `
      DELETE FROM products
      WHERE id = $1::uuid
      RETURNING id
    `;

    try {
      const result = await query(text, [id]);
      if (result.rowCount === 0) return null;

      logger.info("Product deleted successfully", { productId: id });
      return result.rows[0];
    } catch (error) {
      throw handleDatabaseError(error, "delete", { productId: id });
    }
  },

  async exists(id) {
    const text = `
      SELECT EXISTS (
        SELECT 1 FROM products WHERE id = $1::uuid
      ) AS exists
    `;

    try {
      const result = await query(text, [id]);
      return result.rows[0]?.exists ?? false;
    } catch (error) {
      throw handleDatabaseError(error, "exists", { productId: id });
    }
  },

  async slugExists(slug, excludeId = null) {
    const text = `
      SELECT EXISTS (
        SELECT 1 FROM products
        WHERE slug = $1 AND ($2::UUID IS NULL OR id <> $2::uuid)
      ) AS exists
    `;

    try {
      const result = await query(text, [slug, excludeId]);
      return result.rows[0]?.exists ?? false;
    } catch (error) {
      throw handleDatabaseError(error, "slugExists", { slug });
    }
  },
};
