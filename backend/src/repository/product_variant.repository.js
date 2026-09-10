import { query, withTransaction } from "../config/db.js";
import { COLOUR_GROUP } from "../config/attribute.groups.js";
import { logger } from "../utils/logger.js";

const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  CHECK_VIOLATION: "23514",
};

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Product variant repository error: ${operation}`, {
    operation,
    ...context,
    code: error.code,
    constraint: error.constraint,
    message: error.message,
  });

  if (
    error.code === PG_ERROR_CODES.UNIQUE_VIOLATION &&
    error.constraint === "uq_product_variants_product_size_colour"
  ) {
    const err = new Error("VARIANT_SIZE_EXISTS");
    err.code = "VARIANT_SIZE_EXISTS";
    return err;
  }

  if (error.code === PG_ERROR_CODES.FOREIGN_KEY_VIOLATION) {
    const err = new Error("VARIANT_PRODUCT_NOT_FOUND");
    err.code = "VARIANT_PRODUCT_NOT_FOUND";
    return err;
  }

  if (error.code === PG_ERROR_CODES.CHECK_VIOLATION) {
    const err = new Error("VARIANT_STOCK_NEGATIVE");
    err.code = "VARIANT_STOCK_NEGATIVE";
    return err;
  }

  return error;
};

/**
 * Every read carries the colour's swatch, joined from the approved-values
 * register rather than stored on the variant.
 *
 * The alternative — a `colour_hex` column on product_variants — would go
 * stale the moment a colour was re-toned in the register, and would have
 * to be rewritten across the catalogue to fix it. Joining costs one
 * index lookup per row against uq_product_attribute_values_group_value.
 *
 * Colourless variants hold '' , which matches no register row, so their
 * hex comes back NULL. That is the correct answer, not a missing one.
 */
const SELECT_VARIANT = `
  SELECT v.*, reg.hex AS colour_hex
  FROM product_variants v
  LEFT JOIN product_attribute_values reg
    ON reg.group_name = '${COLOUR_GROUP}' AND reg.value = v.colour
`;

/**
 * The order variants read back in, everywhere.
 *
 * Position first, because it is what the product form arranged. Colour
 * before size on the tie-break so a product's rows group into colourways
 * rather than interleaving Maroon M with Teal M — which is how the
 * matrix editor lays them out, and how a stock table is read.
 */
const VARIANT_ORDER = "v.position ASC, v.colour ASC, v.size ASC";

export const ProductVariantRepository = {
  async findByProductId(productId) {
    const text = `
      ${SELECT_VARIANT}
      WHERE v.product_id = $1::uuid
      ORDER BY ${VARIANT_ORDER}
    `;

    try {
      const result = await query(text, [productId]);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "findByProductId", { productId });
    }
  },

  /**
   * Variants for many products in one round trip — the product list needs
   * a stock summary per row and must not issue a query per product.
   */
  async findByProductIds(productIds) {
    if (!Array.isArray(productIds) || productIds.length === 0) return [];

    const text = `
      ${SELECT_VARIANT}
      WHERE v.product_id = ANY($1::uuid[])
      ORDER BY v.product_id, ${VARIANT_ORDER}
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

  async findById(id) {
    const text = `
      ${SELECT_VARIANT}
      WHERE v.id = $1::uuid
      LIMIT 1
    `;

    try {
      const result = await query(text, [id]);
      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findById", { variantId: id });
    }
  },

  async findAll({ page = 1, limit = 100 } = {}) {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const offset = (safePage - 1) * safeLimit;

    const text = `
      ${SELECT_VARIANT}
      ORDER BY v.product_id, ${VARIANT_ORDER}
      LIMIT $1 OFFSET $2
    `;

    try {
      const result = await query(text, [safeLimit, offset]);
      const countResult = await query(
        "SELECT COUNT(*)::INTEGER AS count FROM product_variants",
      );

      return { rows: result.rows, total: countResult.rows[0]?.count ?? 0 };
    } catch (error) {
      throw handleDatabaseError(error, "findAll", { page: safePage });
    }
  },

  async create({
    productId,
    size,
    colour = "",
    stockQuantity = 0,
    active = true,
    position = 0,
  }) {
    const text = `
      INSERT INTO product_variants (
        product_id, size, colour, stock_quantity, active, position,
        created_at, updated_at
      )
      VALUES ($1::uuid, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
    `;

    try {
      const result = await query(text, [
        productId,
        size,
        colour,
        stockQuantity,
        active,
        position,
      ]);

      logger.info("Product variant created", {
        variantId: result.rows[0]?.id,
        productId,
        size,
        colour,
      });

      return result.rows[0];
    } catch (error) {
      throw handleDatabaseError(error, "create", { productId, size, colour });
    }
  },

  async update(id, updateData) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (updateData.size !== undefined) {
      fields.push(`size = $${paramIndex++}`);
      values.push(updateData.size);
    }

    if (updateData.colour !== undefined) {
      fields.push(`colour = $${paramIndex++}`);
      values.push(updateData.colour);
    }

    if (updateData.stockQuantity !== undefined) {
      fields.push(`stock_quantity = $${paramIndex++}`);
      values.push(updateData.stockQuantity);
    }

    if (updateData.active !== undefined) {
      fields.push(`active = $${paramIndex++}`);
      values.push(updateData.active);
    }

    if (fields.length === 0) {
      throw new Error("No variant fields provided for update");
    }

    fields.push("updated_at = NOW()");
    values.push(id);

    const text = `
      UPDATE product_variants
      SET ${fields.join(", ")}
      WHERE id = $${paramIndex}::uuid
      RETURNING *
    `;

    try {
      const result = await query(text, values);
      if (result.rowCount === 0) return null;

      logger.info("Product variant updated", { variantId: id });
      return result.rows[0];
    } catch (error) {
      throw handleDatabaseError(error, "update", { variantId: id });
    }
  },

  async delete(id) {
    const text = `
      DELETE FROM product_variants
      WHERE id = $1::uuid
      RETURNING id
    `;

    try {
      const result = await query(text, [id]);
      if (result.rowCount === 0) return null;

      logger.info("Product variant deleted", { variantId: id });
      return result.rows[0];
    } catch (error) {
      throw handleDatabaseError(error, "delete", { variantId: id });
    }
  },

  /**
   * Several variants by id, each carrying its product's name.
   *
   * The name is joined here because every caller of this is a
   * multi-select action that has to *describe* what it is about to do —
   * "delete 6 sizes" is not something anyone should confirm without
   * seeing which six. With colour in play the description needs it too:
   * "Maroon M" and "Teal M" are two different rows holding two different
   * stock counts.
   */
  async findByIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];

    const text = `
      SELECT v.*, p.name AS product_name, p.slug AS product_slug
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      WHERE v.id = ANY($1::uuid[])
      ORDER BY p.name ASC, v.position ASC, v.colour ASC, v.size ASC
    `;

    try {
      const result = await query(text, [ids]);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "findByIds", { count: ids.length });
    }
  },

  /**
   * Takes several sizes off sale, or puts them back (F-03.11).
   *
   * One statement rather than a loop: the whole selection changes
   * together or not at all, so a half-applied "deactivate every XXL"
   * cannot leave the catalogue in a state nobody asked for.
   */
  async bulkSetActive(ids, active) {
    const text = `
      UPDATE product_variants
      SET active = $2, updated_at = NOW()
      WHERE id = ANY($1::uuid[])
      RETURNING *
    `;

    try {
      const result = await query(text, [ids, active]);

      logger.info("Product variants bulk status change", {
        count: result.rowCount,
        active,
      });

      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "bulkSetActive", { count: ids.length });
    }
  },

  /**
   * Deletes several sizes, and reports which products that leaves with
   * none.
   *
   * Both halves run in one transaction so the second answer describes
   * the catalogue the first half actually produced — asking afterwards
   * could read a state something else had moved on from.
   *
   * @returns {Promise<{deleted: object[], emptiedProducts: object[]}>}
   */
  async bulkDelete(ids) {
    try {
      return await withTransaction(async (client) => {
        const deleted = await client.query(
          `DELETE FROM product_variants
           WHERE id = ANY($1::uuid[])
           RETURNING id, product_id, size, colour`,
          [ids],
        );

        const productIds = [...new Set(deleted.rows.map((row) => row.product_id))];

        // A product with no sizes left has nothing a shopper can put in
        // a bag. Not refused — clearing a size run to re-enter it is a
        // legitimate thing to do — but the caller is told, so the screen
        // can say so rather than leaving it to be discovered later.
        const emptied =
          productIds.length === 0
            ? { rows: [] }
            : await client.query(
                `SELECT p.id, p.name, p.slug
                 FROM products p
                 WHERE p.id = ANY($1::uuid[])
                   AND NOT EXISTS (
                     SELECT 1 FROM product_variants v WHERE v.product_id = p.id
                   )`,
                [productIds],
              );

        logger.info("Product variants bulk deleted", {
          count: deleted.rowCount,
          emptiedProducts: emptied.rows.length,
        });

        return { deleted: deleted.rows, emptiedProducts: emptied.rows };
      });
    } catch (error) {
      throw handleDatabaseError(error, "bulkDelete", { count: ids.length });
    }
  },

  /**
   * Makes a product's variant set exactly match `variants`, in one
   * transaction: rows already present are updated, new ones inserted,
   * and any row no longer listed is removed.
   *
   * The product form edits the whole set at once, so a single atomic
   * write is both simpler for the caller and safer than a sequence of
   * requests that can fail halfway and leave a product with three of the
   * four rows the admin intended.
   *
   * The identity of a row is the (size, colour) pair, not the size —
   * which is what makes "add Teal to a product already sold in Maroon"
   * an insert of four new rows rather than a rewrite of the four that
   * exist.
   */
  async replaceForProduct(productId, variants) {
    try {
      return await withTransaction(async (client) => {
        const keptSizes = variants.map((variant) => variant.size);
        const keptColours = variants.map((variant) => variant.colour ?? "");

        // Remove first, so renaming M -> L in one save cannot collide
        // with the unique constraint on a row that is about to go.
        if (keptSizes.length === 0) {
          await client.query(
            "DELETE FROM product_variants WHERE product_id = $1::uuid",
            [productId],
          );
        } else {
          // Zipped into pairs rather than matched on two independent
          // ANY() lists: keeping sizes {S, M} and colours {Maroon, Teal}
          // separately would spare (S, Teal) even when the admin only
          // listed (S, Maroon) and (M, Teal).
          await client.query(
            `DELETE FROM product_variants
             WHERE product_id = $1::uuid
               AND (size, colour) NOT IN (
                 SELECT s, c
                 FROM unnest($2::varchar[], $3::varchar[]) AS kept(s, c)
               )`,
            [productId, keptSizes, keptColours],
          );
        }

        for (const [index, variant] of variants.entries()) {
          await client.query(
            `INSERT INTO product_variants (
               product_id, size, colour, stock_quantity, active, position,
               created_at, updated_at
             )
             VALUES ($1::uuid, $2, $3, $4, $5, $6, NOW(), NOW())
             ON CONFLICT ON CONSTRAINT uq_product_variants_product_size_colour
             DO UPDATE SET
               stock_quantity = EXCLUDED.stock_quantity,
               active = EXCLUDED.active,
               position = EXCLUDED.position,
               updated_at = NOW()`,
            [
              productId,
              variant.size,
              variant.colour ?? "",
              variant.stockQuantity,
              variant.active,
              index,
            ],
          );
        }

        const result = await client.query(
          `${SELECT_VARIANT}
           WHERE v.product_id = $1::uuid
           ORDER BY ${VARIANT_ORDER}`,
          [productId],
        );

        logger.info("Product variants replaced", {
          productId,
          count: result.rows.length,
        });

        return result.rows;
      });
    } catch (error) {
      throw handleDatabaseError(error, "replaceForProduct", { productId });
    }
  },

  /**
   * Renames a colour across every variant carrying it — the variant half
   * of the register's rename (see AttributeValueRepository).
   *
   * Variants store the colour's name, not a key into the register, so a
   * rename that only touched the register would leave the catalogue full
   * of a colour the register no longer offers. Called inside the
   * register's own transaction, on the client it hands over, so the two
   * halves commit together or not at all.
   *
   * @param {import('pg').PoolClient} client
   * @returns {Promise<number>} how many variant rows were rewritten
   */
  async renameColourInTransaction(client, from, to) {
    const result = await client.query(
      `UPDATE product_variants
          SET colour = $2, updated_at = NOW()
        WHERE colour = $1
      RETURNING id`,
      [from, to],
    );

    return result.rowCount ?? 0;
  },
};
