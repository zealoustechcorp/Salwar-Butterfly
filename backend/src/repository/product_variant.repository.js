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

/**
 * Which rows of a size-matrix save were edited against a stock count
 * that has since moved.
 *
 * Pure, so the rule is testable without a database: `variants` is the
 * normalised payload, `currentRows` the stored rows (size, colour,
 * stock_quantity). Only rows that carry `expectedStock` and already exist
 * are compared.
 *
 * @returns {Array<{index, size, colour, expected, current}>}
 */
export const findStockConflicts = (variants, currentRows) => {
  const stored = new Map(
    currentRows.map((row) => [
      `${row.size}\t${row.colour ?? ""}`,
      Number(row.stock_quantity),
    ]),
  );

  const conflicts = [];

  variants.forEach((variant, index) => {
    if (variant.expectedStock === undefined || variant.expectedStock === null) {
      return;
    }

    const key = `${variant.size}\t${variant.colour ?? ""}`;
    if (!stored.has(key)) return;

    const current = stored.get(key);

    if (current !== Number(variant.expectedStock)) {
      conflicts.push({
        index,
        size: variant.size,
        colour: variant.colour ?? "",
        expected: Number(variant.expectedStock),
        current,
      });
    }
  });

  return conflicts;
};

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

  /**
   * Every variant of the given products, for the stock roll-up.
   *
   * getAllVariants pages by variant row, so a product whose rows straddle
   * a page boundary used to be summarised from whichever half landed on
   * the page — "4 in stock" for a product holding 9. The summaries are
   * built from this instead: all of a product's rows, for every product
   * that appears on the page, in one query.
   */
  async findForSummaries(productIds) {
    if (!Array.isArray(productIds) || productIds.length === 0) return [];

    const text = `
      SELECT v.product_id, v.size, v.colour, v.stock_quantity, v.active,
             v.position
      FROM product_variants v
      WHERE v.product_id = ANY($1::uuid[])
      ORDER BY v.product_id, ${VARIANT_ORDER}
    `;

    try {
      const result = await query(text, [productIds]);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "findForSummaries", {
        count: productIds.length,
      });
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

  /**
   * Deletes one variant, unless it still holds stock and `force` is off.
   *
   * The same rule as bulkDelete, which the single delete used to skip:
   * deleting a variant destroys its stock count, and there is no other
   * record of it. The row is locked while it is checked, so a sale or a
   * restock cannot change the answer between the check and the delete.
   *
   * @returns {Promise<{status: "missing"} |
   *   {status: "blocked" | "deleted", row: object}>}
   */
  async delete(id, { force = false } = {}) {
    try {
      return await withTransaction(async (client) => {
        const found = await client.query(
          `SELECT v.id, v.product_id, v.size, v.colour, v.stock_quantity,
                  p.name AS product_name
           FROM product_variants v
           JOIN products p ON p.id = v.product_id
           WHERE v.id = $1::uuid
           FOR UPDATE OF v`,
          [id],
        );

        const row = found.rows[0];
        if (!row) return { status: "missing" };

        if (!force && Number(row.stock_quantity) > 0) {
          return { status: "blocked", row };
        }

        await client.query(
          "DELETE FROM product_variants WHERE id = $1::uuid",
          [id],
        );

        logger.info("Product variant deleted", {
          variantId: id,
          stockDiscarded: Number(row.stock_quantity),
        });

        return { status: "deleted", row };
      });
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
   * Deletes several sizes — the ones not still holding stock, unless
   * `force` — and reports which products that leaves with none.
   *
   * Everything runs in one transaction, and the stock check is part of
   * it: the selection is read FOR UPDATE, so a size that sells its last
   * unit, or is restocked, while the admin's request is in flight is
   * judged on the count it actually has when it is deleted. The check
   * used to read the rows before the transaction began, which is a
   * window in which a restocked size could be deleted along with its new
   * stock. Locked in id order, the same order checkout locks variants
   * in, so the two cannot deadlock on each other.
   *
   * The emptied-products answer is read in the same transaction so it
   * describes the catalogue the delete actually produced.
   *
   * @returns {Promise<{found: object[], blocked: object[],
   *   deleted: object[], emptiedProducts: object[]}>}
   */
  async bulkDelete(ids, { force = false } = {}) {
    try {
      return await withTransaction(async (client) => {
        const found = await client.query(
          `SELECT v.*, p.name AS product_name, p.slug AS product_slug
           FROM product_variants v
           JOIN products p ON p.id = v.product_id
           WHERE v.id = ANY($1::uuid[])
           ORDER BY v.id
           FOR UPDATE OF v`,
          [ids],
        );

        const blocked = force
          ? []
          : found.rows.filter((row) => Number(row.stock_quantity) > 0);
        const blockedIds = new Set(blocked.map((row) => row.id));
        const deletableIds = found.rows
          .filter((row) => !blockedIds.has(row.id))
          .map((row) => row.id);

        if (deletableIds.length === 0) {
          return {
            found: found.rows,
            blocked,
            deleted: [],
            emptiedProducts: [],
          };
        }

        const deleted = await client.query(
          `DELETE FROM product_variants
           WHERE id = ANY($1::uuid[])
           RETURNING id, product_id, size, colour`,
          [deletableIds],
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

        return {
          found: found.rows,
          blocked,
          deleted: deleted.rows,
          emptiedProducts: emptied.rows,
        };
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
   *
   * Stock is the one column that moves without the admin: every sale
   * decrements it. The form is filled from a read taken when the page
   * opened, so writing its numbers back as they are would undo every
   * sale made since — a size that sold out at 10:05 restored to 3 by a
   * price edit saved at 10:10. A row that carries `expectedStock` (the
   * count the form was loaded with) is compared with the stored count
   * under a row lock, and any mismatch rejects the whole save before
   * anything is written; the caller re-reads and tries again. Rows
   * without it keep the old last-write-wins behaviour, and new rows have
   * nothing to compare against.
   *
   * @returns {Promise<object[]>} the saved rows
   * @throws {Error} code VARIANT_STOCK_CHANGED, with `conflicts`
   */
  async replaceForProduct(productId, variants) {
    try {
      return await withTransaction(async (client) => {
        const current = await client.query(
          `SELECT id, size, colour, stock_quantity
           FROM product_variants
           WHERE product_id = $1::uuid
           ORDER BY id
           FOR UPDATE`,
          [productId],
        );

        const conflicts = findStockConflicts(variants, current.rows);

        if (conflicts.length > 0) {
          const err = new Error("VARIANT_STOCK_CHANGED");
          err.code = "VARIANT_STOCK_CHANGED";
          err.conflicts = conflicts;
          throw err;
        }

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
      if (error?.code === "VARIANT_STOCK_CHANGED") throw error;
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
