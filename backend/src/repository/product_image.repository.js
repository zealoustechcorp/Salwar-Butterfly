import { query, withTransaction } from "../config/db.js";
import { logger } from "../utils/logger.js";

const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
};

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Product image repository error: ${operation}`, {
    operation,
    ...context,
    code: error.code,
    constraint: error.constraint,
    message: error.message,
  });

  if (
    error.code === PG_ERROR_CODES.UNIQUE_VIOLATION &&
    error.constraint === "uq_product_images_public_id"
  ) {
    const err = new Error("IMAGE_ALREADY_REGISTERED");
    err.code = "IMAGE_ALREADY_REGISTERED";
    return err;
  }

  if (error.code === PG_ERROR_CODES.FOREIGN_KEY_VIOLATION) {
    const err = new Error("IMAGE_PRODUCT_NOT_FOUND");
    err.code = "IMAGE_PRODUCT_NOT_FOUND";
    return err;
  }

  return error;
};

export const ProductImageRepository = {
  async findByProductId(productId) {
    const text = `
      SELECT * FROM product_images
      WHERE product_id = $1::uuid
      ORDER BY position ASC, created_at ASC
    `;

    try {
      const result = await query(text, [productId]);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "findByProductId", { productId });
    }
  },

  /**
   * Galleries for many products in one round trip — the product list draws
   * a thumbnail per row and must not issue a query per product.
   */
  async findByProductIds(productIds) {
    if (!Array.isArray(productIds) || productIds.length === 0) return [];

    const text = `
      SELECT * FROM product_images
      WHERE product_id = ANY($1::uuid[])
      ORDER BY product_id, position ASC, created_at ASC
    `;

    try {
      const result = await query(text, [productIds]);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "findByProductIds", {
        count: productIds.length,
      });
    }
  },

  async findAll({ page = 1, limit = 200 } = {}) {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const offset = (safePage - 1) * safeLimit;

    const text = `
      SELECT * FROM product_images
      ORDER BY product_id, position ASC, created_at ASC
      LIMIT $1 OFFSET $2
    `;

    try {
      const result = await query(text, [safeLimit, offset]);
      const countResult = await query(
        "SELECT COUNT(*)::INTEGER AS count FROM product_images",
      );

      return { rows: result.rows, total: countResult.rows[0]?.count ?? 0 };
    } catch (error) {
      throw handleDatabaseError(error, "findAll", { page: safePage });
    }
  },

  async findById(id) {
    const text = `
      SELECT * FROM product_images
      WHERE id = $1::uuid
      LIMIT 1
    `;

    try {
      const result = await query(text, [id]);
      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findById", { imageId: id });
    }
  },

  async countByProductId(productId) {
    const text = `
      SELECT COUNT(*)::INTEGER AS count
      FROM product_images
      WHERE product_id = $1::uuid
    `;

    try {
      const result = await query(text, [productId]);
      return result.rows[0]?.count ?? 0;
    } catch (error) {
      throw handleDatabaseError(error, "countByProductId", { productId });
    }
  },

  /**
   * Registers already-uploaded images against a product, appending them
   * after whatever is already there, in one transaction.
   *
   * Positions are assigned from the current maximum rather than passed in:
   * two admins uploading at once would otherwise both compute the same
   * next position from a stale read.
   *
   * @param {string} productId
   * @param {Array<{imageUrl: string, imagePublicId: string, altText: ?string}>} images
   * @returns {Promise<object[]>} the product's whole gallery, in order
   */
  async appendForProduct(productId, images) {
    try {
      return await withTransaction(async (client) => {
        // Locks the product row, so concurrent uploads to the same product
        // serialize here instead of racing for a position.
        const product = await client.query(
          "SELECT id FROM products WHERE id = $1::uuid FOR UPDATE",
          [productId],
        );

        if (product.rowCount === 0) {
          const error = new Error("IMAGE_PRODUCT_NOT_FOUND");
          error.code = "IMAGE_PRODUCT_NOT_FOUND";
          throw error;
        }

        const highest = await client.query(
          `SELECT COALESCE(MAX(position) + 1, 0)::INTEGER AS next
           FROM product_images
           WHERE product_id = $1::uuid`,
          [productId],
        );

        let position = highest.rows[0]?.next ?? 0;

        for (const image of images) {
          await client.query(
            `INSERT INTO product_images (
               product_id, image_url, image_public_id, alt_text, position,
               created_at, updated_at
             )
             VALUES ($1::uuid, $2, $3, $4, $5, NOW(), NOW())`,
            [
              productId,
              image.imageUrl,
              image.imagePublicId,
              image.altText ?? null,
              position,
            ],
          );

          position += 1;
        }

        const result = await client.query(
          `SELECT * FROM product_images
           WHERE product_id = $1::uuid
           ORDER BY position ASC, created_at ASC`,
          [productId],
        );

        logger.info("Product images appended", {
          productId,
          added: images.length,
          total: result.rows.length,
        });

        return result.rows;
      });
    } catch (error) {
      throw handleDatabaseError(error, "appendForProduct", { productId });
    }
  },

  async updateAltText(id, altText) {
    const text = `
      UPDATE product_images
      SET alt_text = $1, updated_at = NOW()
      WHERE id = $2::uuid
      RETURNING *
    `;

    try {
      const result = await query(text, [altText, id]);
      if (result.rowCount === 0) return null;

      logger.info("Product image alt text updated", { imageId: id });
      return result.rows[0];
    } catch (error) {
      throw handleDatabaseError(error, "updateAltText", { imageId: id });
    }
  },

  /**
   * Applies `imageIds` as the gallery's order, then closes any gaps left
   * behind, in one transaction.
   *
   * The caller has already checked that `imageIds` is exactly this
   * product's set of images, so the second pass only matters if a row was
   * deleted between that check and this write.
   *
   * @returns {Promise<object[]>} the reordered gallery
   */
  async reorderForProduct(productId, imageIds) {
    try {
      return await withTransaction(async (client) => {
        for (const [index, imageId] of imageIds.entries()) {
          await client.query(
            `UPDATE product_images
             SET position = $1, updated_at = NOW()
             WHERE id = $2::uuid AND product_id = $3::uuid`,
            [index, imageId, productId],
          );
        }

        // Anything not named in the payload keeps its relative order but
        // moves behind the images that were, so positions stay contiguous
        // and position 0 is always exactly one row.
        await client.query(
          `UPDATE product_images AS target
           SET position = ranked.rank - 1, updated_at = NOW()
           FROM (
             SELECT id, ROW_NUMBER() OVER (ORDER BY position ASC, created_at ASC) AS rank
             FROM product_images
             WHERE product_id = $1::uuid
           ) AS ranked
           WHERE target.id = ranked.id AND target.position <> ranked.rank - 1`,
          [productId],
        );

        const result = await client.query(
          `SELECT * FROM product_images
           WHERE product_id = $1::uuid
           ORDER BY position ASC, created_at ASC`,
          [productId],
        );

        logger.info("Product images reordered", {
          productId,
          count: result.rows.length,
        });

        return result.rows;
      });
    } catch (error) {
      throw handleDatabaseError(error, "reorderForProduct", { productId });
    }
  },

  /**
   * Deletes one image and closes the gap it leaves, so the next image
   * becomes the cover rather than the gallery starting at position 1.
   *
   * @returns {Promise<object|null>} the deleted row, for its R2 object key
   */
  async delete(id) {
    try {
      return await withTransaction(async (client) => {
        const deleted = await client.query(
          "DELETE FROM product_images WHERE id = $1::uuid RETURNING *",
          [id],
        );

        if (deleted.rowCount === 0) return null;

        const row = deleted.rows[0];

        await client.query(
          `UPDATE product_images
           SET position = position - 1, updated_at = NOW()
           WHERE product_id = $1::uuid AND position > $2`,
          [row.product_id, row.position],
        );

        logger.info("Product image deleted", {
          imageId: id,
          productId: row.product_id,
        });

        return row;
      });
    } catch (error) {
      throw handleDatabaseError(error, "delete", { imageId: id });
    }
  },
};
