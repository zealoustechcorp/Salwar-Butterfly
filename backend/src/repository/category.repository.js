import { query } from "../config/db.js";
import { logger } from "../utils/logger.js";

const CATEGORY_COLUMNS = `
  id, name, slug, description, image, image_public_id, fits, 
  active, deleted_at, created_at, updated_at
`;

export class CategoryRepository {
  static async create(data) {
    const { name, slug, description, image, imagePublicId, fits, active } =
      data;

    const sql = `
      INSERT INTO categories (name, slug, description, image, image_public_id, fits, active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW(), NOW())
      RETURNING ${CATEGORY_COLUMNS}
    `;

    const fitsJson = fits ? JSON.stringify(fits) : null;

    try {
      const result = await query(sql, [
        name,
        slug,
        description,
        image,
        imagePublicId,
        fitsJson,
        active,
      ]);

      if (!result.rows[0]) {
        logger.error("Category create returned no row", { slug });
        throw new Error("CATEGORY_CREATE_FAILED");
      }

      logger.info("Category created successfully", {
        categoryId: result.rows[0].id,
        slug: result.rows[0].slug,
      });

      return result.rows[0];
    } catch (error) {
      logger.error("Category create error", {
        error: error.message,
        code: error.code,
        slug,
      });
      throw error;
    }
  }

  static async findById(id) {
    const sql = `
      SELECT ${CATEGORY_COLUMNS} FROM categories
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1
    `;

    try {
      const result = await query(sql, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error("Category findById error", {
        categoryId: id,
        error: error.message,
      });
      throw error;
    }
  }

  static async findBySlug(slug) {
    const sql = `
      SELECT ${CATEGORY_COLUMNS} FROM categories
      WHERE slug = $1 AND deleted_at IS NULL
      LIMIT 1
    `;

    try {
      const result = await query(sql, [slug]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error("Category findBySlug error", { slug, error: error.message });
      throw error;
    }
  }

  static async findAll(limit = 20, offset = 0) {
    const sql = `
      SELECT ${CATEGORY_COLUMNS} FROM categories
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;

    try {
      const result = await query(sql, [limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error("Category findAll error", {
        limit,
        offset,
        error: error.message,
      });
      throw error;
    }
  }

  static async countAll() {
    const sql = `
      SELECT COUNT(*)::INTEGER as count FROM categories
      WHERE deleted_at IS NULL
    `;

    try {
      const result = await query(sql);
      return result.rows[0]?.count || 0;
    } catch (error) {
      logger.error("Category countAll error", { error: error.message });
      throw error;
    }
  }

  static async update(id, updateData) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (updateData.name !== undefined) {
      fields.push(`name = $${paramIndex}`);
      values.push(updateData.name);
      paramIndex++;
    }

    if (updateData.slug !== undefined) {
      fields.push(`slug = $${paramIndex}`);
      values.push(updateData.slug);
      paramIndex++;
    }

    if (updateData.description !== undefined) {
      fields.push(`description = $${paramIndex}`);
      values.push(updateData.description);
      paramIndex++;
    }

    if (updateData.image !== undefined) {
      fields.push(`image = $${paramIndex}`);
      values.push(updateData.image);
      paramIndex++;
    }

    if (updateData.imagePublicId !== undefined) {
      fields.push(`image_public_id = $${paramIndex}`);
      values.push(updateData.imagePublicId);
      paramIndex++;
    }

    if (updateData.fits !== undefined) {
      fields.push(`fits = $${paramIndex}::jsonb`);
      const fitsJson = updateData.fits ? JSON.stringify(updateData.fits) : null;
      values.push(fitsJson);
      paramIndex++;
    }

    if (updateData.active !== undefined) {
      fields.push(`active = $${paramIndex}`);
      values.push(updateData.active);
      paramIndex++;
    }

    if (fields.length === 0) {
      throw new Error("NO_UPDATE_FIELDS");
    }

    fields.push("updated_at = NOW()");
    values.push(id);

    const sql = `
      UPDATE categories
      SET ${fields.join(", ")}
      WHERE id = $${paramIndex} AND deleted_at IS NULL
      RETURNING ${CATEGORY_COLUMNS}
    `;

    try {
      const result = await query(sql, values);

      if (result.rowCount === 0) {
        logger.warn("Category update target not found", { categoryId: id });
        throw new Error("CATEGORY_NOT_FOUND");
      }

      logger.info("Category updated successfully", {
        categoryId: id,
        fields: Object.keys(updateData),
      });

      return result.rows[0];
    } catch (error) {
      logger.error("Category update error", {
        categoryId: id,
        error: error.message,
        code: error.code,
      });
      throw error;
    }
  }

  /**
   * What still hangs off a category: its products and its sub-categories.
   *
   * Products carry no deleted_at, so every row counts. Read before a
   * delete so the refusal can say how many, and what to do about them.
   */
  static async countDependents(id) {
    const sql = `
      SELECT
        (SELECT COUNT(*)::INTEGER FROM products WHERE category_id = $1::uuid) AS products,
        (SELECT COUNT(*)::INTEGER FROM sub_categories WHERE category_id = $1::uuid) AS sub_categories
    `;

    try {
      const result = await query(sql, [id]);
      return {
        products: result.rows[0]?.products ?? 0,
        subCategories: result.rows[0]?.sub_categories ?? 0,
      };
    } catch (error) {
      logger.error("Category countDependents error", {
        categoryId: id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Soft-deletes a category, but only an empty one.
   *
   * The emptiness is part of the UPDATE rather than trusted from the
   * count the service read a moment earlier, so a product filed into the
   * category in between still stops the delete. Zero rows back means the
   * category is gone or is no longer empty; the service tells which.
   */
  static async softDelete(id) {
    const sql = `
      UPDATE categories
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM products WHERE category_id = $1::uuid)
        AND NOT EXISTS (SELECT 1 FROM sub_categories WHERE category_id = $1::uuid)
      RETURNING id, deleted_at
    `;

    try {
      const result = await query(sql, [id]);

      if (result.rowCount === 0) {
        logger.warn("Category soft delete target not found", {
          categoryId: id,
        });
        throw new Error("CATEGORY_NOT_FOUND");
      }

      logger.info("Category soft deleted successfully", {
        categoryId: id,
      });

      return result.rows[0];
    } catch (error) {
      logger.error("Category softDelete error", {
        categoryId: id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Who holds a slug, deleted rows included.
   *
   * `checkSlugExists` ignores deleted categories, which matches the live
   * index (unique only WHERE deleted_at IS NULL) but not the migration's
   * plain UNIQUE. On a database built from the migration a deleted
   * category still owns its slug, and the insert fails on it after the
   * check said the slug was free — this is what lets that be reported as
   * what it is.
   */
  static async findSlugHolder(slug, excludeId = null) {
    const sql = `
      SELECT id, name, deleted_at FROM categories
      WHERE slug = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)
      ORDER BY deleted_at NULLS FIRST
      LIMIT 1
    `;

    try {
      const result = await query(sql, [slug, excludeId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error("Category findSlugHolder error", {
        slug,
        error: error.message,
      });
      throw error;
    }
  }

  static async checkSlugExists(slug, excludeId = null) {
    const sql = excludeId
      ? `SELECT EXISTS(SELECT 1 FROM categories WHERE slug = $1 AND deleted_at IS NULL AND id != $2) as exists`
      : `SELECT EXISTS(SELECT 1 FROM categories WHERE slug = $1 AND deleted_at IS NULL) as exists`;

    try {
      const params = excludeId ? [slug, excludeId] : [slug];
      const result = await query(sql, params);
      return result.rows[0]?.exists || false;
    } catch (error) {
      logger.error("Category checkSlugExists error", {
        slug,
        error: error.message,
      });
      throw error;
    }
  }
}
