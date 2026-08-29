import { query } from "../config/db.js";
import { logger } from "../utils/logger.js";

const SUB_CATEGORY_COLUMNS = `
  id, name, category_id, is_active, created_at, updated_at
`;

export class SubCategoryRepository {
  static async create(data) {
    const { name, categoryId, isActive } = data;

    const sql = `
      INSERT INTO sub_categories (name, category_id, is_active, created_at, updated_at)
      VALUES ($1, $2::uuid, $3, NOW(), NOW())
      RETURNING ${SUB_CATEGORY_COLUMNS}
    `;

    try {
      const result = await query(sql, [name, categoryId, isActive]);

      if (!result.rows[0]) {
        logger.error("Sub-category create returned no row", {
          name,
          categoryId,
        });
        throw new Error("SUB_CATEGORY_CREATE_FAILED");
      }

      logger.info("Sub-category created successfully", {
        subCategoryId: result.rows[0].id,
        categoryId: result.rows[0].category_id,
        name: result.rows[0].name,
      });

      return result.rows[0];
    } catch (error) {
      logger.error("Sub-category create error", {
        error: error.message,
        code: error.code,
        name,
        categoryId,
      });
      throw error;
    }
  }

  static async findById(id) {
    const sql = `
      SELECT ${SUB_CATEGORY_COLUMNS} FROM sub_categories
      WHERE id = $1::uuid
      LIMIT 1
    `;

    try {
      const result = await query(sql, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error("Sub-category findById error", {
        subCategoryId: id,
        error: error.message,
      });
      throw error;
    }
  }

  static async findByCategoryId(categoryId, limit = 20, offset = 0) {
    const sql = `
      SELECT ${SUB_CATEGORY_COLUMNS} FROM sub_categories
      WHERE category_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    try {
      const result = await query(sql, [categoryId, limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error("Sub-category findByCategoryId error", {
        categoryId,
        limit,
        offset,
        error: error.message,
      });
      throw error;
    }
  }

  static async findAll(limit = 20, offset = 0) {
    const sql = `
      SELECT ${SUB_CATEGORY_COLUMNS} FROM sub_categories
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;

    try {
      const result = await query(sql, [limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error("Sub-category findAll error", {
        limit,
        offset,
        error: error.message,
      });
      throw error;
    }
  }

  static async countByCategoryId(categoryId) {
    const sql = `
      SELECT COUNT(*)::INTEGER as count FROM sub_categories
      WHERE category_id = $1::uuid
    `;

    try {
      const result = await query(sql, [categoryId]);
      return result.rows[0]?.count || 0;
    } catch (error) {
      logger.error("Sub-category countByCategoryId error", {
        categoryId,
        error: error.message,
      });
      throw error;
    }
  }

  static async countAll() {
    const sql = `
      SELECT COUNT(*)::INTEGER as count FROM sub_categories
    `;

    try {
      const result = await query(sql);
      return result.rows[0]?.count || 0;
    } catch (error) {
      logger.error("Sub-category countAll error", { error: error.message });
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

    if (updateData.categoryId !== undefined) {
      fields.push(`category_id = $${paramIndex}::uuid`);
      values.push(updateData.categoryId);
      paramIndex++;
    }

    if (updateData.isActive !== undefined) {
      fields.push(`is_active = $${paramIndex}`);
      values.push(updateData.isActive);
      paramIndex++;
    }

    if (fields.length === 0) {
      throw new Error("NO_UPDATE_FIELDS");
    }

    fields.push("updated_at = NOW()");
    values.push(id);

    const sql = `
      UPDATE sub_categories
      SET ${fields.join(", ")}
      WHERE id = $${paramIndex}::uuid
      RETURNING ${SUB_CATEGORY_COLUMNS}
    `;

    try {
      const result = await query(sql, values);

      if (result.rowCount === 0) {
        logger.warn("Sub-category update target not found", {
          subCategoryId: id,
        });
        throw new Error("SUB_CATEGORY_NOT_FOUND");
      }

      logger.info("Sub-category updated successfully", {
        subCategoryId: id,
        fields: Object.keys(updateData),
      });

      return result.rows[0];
    } catch (error) {
      logger.error("Sub-category update error", {
        subCategoryId: id,
        error: error.message,
        code: error.code,
      });
      throw error;
    }
  }

  static async delete(id) {
    const sql = `
      DELETE FROM sub_categories
      WHERE id = $1::uuid
      RETURNING id
    `;

    try {
      const result = await query(sql, [id]);

      if (result.rowCount === 0) {
        logger.warn("Sub-category delete target not found", {
          subCategoryId: id,
        });
        throw new Error("SUB_CATEGORY_NOT_FOUND");
      }

      logger.info("Sub-category deleted successfully", { subCategoryId: id });
      return result.rows[0];
    } catch (error) {
      logger.error("Sub-category delete error", {
        subCategoryId: id,
        error: error.message,
      });
      throw error;
    }
  }

  static async checkCategoryExists(categoryId) {
    const sql = `
      SELECT EXISTS(SELECT 1 FROM categories WHERE id = $1::uuid) as exists
    `;

    try {
      const result = await query(sql, [categoryId]);
      return result.rows[0]?.exists || false;
    } catch (error) {
      logger.error("Sub-category checkCategoryExists error", {
        categoryId,
        error: error.message,
      });
      throw error;
    }
  }
}
