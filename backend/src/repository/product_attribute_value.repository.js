import { query, withTransaction } from "../config/db.js";
import { COLOUR_GROUP } from "../config/attribute.groups.js";
import { ProductVariantRepository } from "./product_variant.repository.js";
import { logger } from "../utils/logger.js";

const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: "23505",
  CHECK_VIOLATION: "23514",
};

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Attribute value repository error: ${operation}`, {
    operation,
    ...context,
    code: error.code,
    constraint: error.constraint,
    message: error.message,
  });

  if (
    error.code === PG_ERROR_CODES.UNIQUE_VIOLATION &&
    error.constraint === "uq_product_attribute_values_group_value"
  ) {
    const err = new Error("ATTRIBUTE_VALUE_EXISTS");
    err.code = "ATTRIBUTE_VALUE_EXISTS";
    return err;
  }

  // Renaming a colour rewrites every variant carrying it, so it can
  // collide on the variant key: a product already listing "M" in the
  // target colour cannot gain a second "M" in it. Named, because the
  // alternative is a raw 23505 surfacing as a 500 on a rename the admin
  // could fix by choosing a different name.
  if (
    error.code === PG_ERROR_CODES.UNIQUE_VIOLATION &&
    error.constraint === "uq_product_variants_product_size_colour"
  ) {
    const err = new Error("COLOUR_RENAME_COLLIDES");
    err.code = "COLOUR_RENAME_COLLIDES";
    return err;
  }

  if (
    error.code === PG_ERROR_CODES.CHECK_VIOLATION &&
    error.constraint === "ck_product_attribute_values_hex"
  ) {
    const err = new Error("ATTRIBUTE_HEX_INVALID");
    err.code = "ATTRIBUTE_HEX_INVALID";
    return err;
  }

  return error;
};

/**
 * How many things currently carry a given value — what makes the
 * retire-or-delete decision an informed one.
 *
 * There is no foreign key to count off: the register curates what may be
 * chosen, it does not own what was already chosen. So usage is counted
 * from wherever the value actually lands, and colour lands somewhere
 * different from every other group. A fabric is a property of the
 * product; a colour is a property of the sellable row, so it is counted
 * over product_variants and DISTINCT by product — "used by 3 products"
 * is the useful answer, not "used by 12 variants", which would make a
 * colour in four sizes look four times as entrenched as it is.
 */
const USAGE_COUNT = `
  (
    CASE WHEN av.group_name = '${COLOUR_GROUP}' THEN (
      SELECT COUNT(DISTINCT v.product_id)::INTEGER
      FROM product_variants v
      WHERE v.colour = av.value
    ) ELSE (
      SELECT COUNT(*)::INTEGER
      FROM products p
      WHERE p.attributes ->> av.group_name = av.value
    ) END
  ) AS usage_count
`;

export const AttributeValueRepository = {
  async findAll({ activeOnly = false } = {}) {
    const text = `
      SELECT av.*, ${USAGE_COUNT}
      FROM product_attribute_values av
      ${activeOnly ? "WHERE av.active = true" : ""}
      ORDER BY av.group_name ASC, av.position ASC, av.value ASC
    `;

    try {
      const result = await query(text, []);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "findAll", { activeOnly });
    }
  },

  async findByGroup(groupName, { activeOnly = false } = {}) {
    const text = `
      SELECT av.*, ${USAGE_COUNT}
      FROM product_attribute_values av
      WHERE av.group_name = $1
      ${activeOnly ? "AND av.active = true" : ""}
      ORDER BY av.position ASC, av.value ASC
    `;

    try {
      const result = await query(text, [groupName]);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "findByGroup", { groupName });
    }
  },

  async findById(id) {
    const text = `
      SELECT av.*, ${USAGE_COUNT}
      FROM product_attribute_values av
      WHERE av.id = $1::uuid
      LIMIT 1
    `;

    try {
      const result = await query(text, [id]);
      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findById", { id });
    }
  },

  async create({ groupName, value, hex = null, active = true, position = null }) {
    // Appended to the end of its group unless a position is given.
    const text = `
      INSERT INTO product_attribute_values (
        group_name, value, hex, active, position, created_at, updated_at
      )
      VALUES (
        $1::varchar, $2::varchar, $5::char(7), $3::boolean,
        COALESCE(
          $4::integer,
          -- $1 appears twice, so both uses need an explicit cast:
          -- without them Postgres cannot deduce one type for the
          -- parameter and rejects the statement (42P08).
          (SELECT COALESCE(MAX(position), -1) + 1
             FROM product_attribute_values
            WHERE group_name = $1::varchar)
        ),
        NOW(), NOW()
      )
      RETURNING *
    `;

    try {
      const result = await query(text, [groupName, value, active, position, hex]);

      logger.info("Attribute value created", {
        id: result.rows[0]?.id,
        groupName,
        value,
      });

      return result.rows[0];
    } catch (error) {
      throw handleDatabaseError(error, "create", { groupName, value });
    }
  },

  async update(id, updateData) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (updateData.value !== undefined) {
      fields.push(`value = $${paramIndex++}`);
      values.push(updateData.value);
    }

    // Null is a real value here — "this colour has no swatch" — so only
    // `undefined` means "leave it alone".
    if (updateData.hex !== undefined) {
      fields.push(`hex = $${paramIndex++}::char(7)`);
      values.push(updateData.hex);
    }

    if (updateData.active !== undefined) {
      fields.push(`active = $${paramIndex++}`);
      values.push(updateData.active);
    }

    if (updateData.position !== undefined) {
      fields.push(`position = $${paramIndex++}`);
      values.push(updateData.position);
    }

    if (fields.length === 0) {
      throw new Error("No attribute value fields provided for update");
    }

    fields.push("updated_at = NOW()");
    values.push(id);

    const text = `
      UPDATE product_attribute_values
      SET ${fields.join(", ")}
      WHERE id = $${paramIndex}::uuid
      RETURNING *
    `;

    try {
      const result = await query(text, values);
      if (result.rowCount === 0) return null;

      logger.info("Attribute value updated", { id });
      return result.rows[0];
    } catch (error) {
      throw handleDatabaseError(error, "update", { id });
    }
  },

  /**
   * Renames a value in the register and everywhere it is carried, in one
   * transaction.
   *
   * Without the second step a rename would orphan whatever still holds
   * the old string: it would show a value the register no longer offers,
   * and the new name would report zero usage.
   *
   * Where the old string is held depends on the group. Colour lives on
   * `product_variants.colour`; every other group lives in
   * `products.attributes`. Both halves commit with the register row or
   * neither does — a rename that half-landed would be worse than one
   * that was refused, because nothing on screen would say so.
   *
   * @returns {{row: object|null, productsUpdated: number}}
   *          `productsUpdated` counts variant rows for a colour, and
   *          products for everything else — the caller only reports it,
   *          and "12 rows updated" is the honest number in both cases.
   */
  async renameWithProducts(id, nextValue) {
    try {
      return await withTransaction(async (client) => {
        const current = await client.query(
          "SELECT * FROM product_attribute_values WHERE id = $1::uuid",
          [id],
        );

        const row = current.rows[0];
        if (!row) return { row: null, productsUpdated: 0 };

        const updated = await client.query(
          `UPDATE product_attribute_values
              SET value = $1, updated_at = NOW()
            WHERE id = $2::uuid
        RETURNING *`,
          [nextValue, id],
        );

        const carriersUpdated =
          row.group_name === COLOUR_GROUP
            ? await ProductVariantRepository.renameColourInTransaction(
                client,
                row.value,
                nextValue,
              )
            : (
                await client.query(
                  `UPDATE products
                      SET attributes = jsonb_set(attributes, ARRAY[$1::text], to_jsonb($2::text)),
                          updated_at = NOW()
                    WHERE attributes ->> $1 = $3
                RETURNING id`,
                  [row.group_name, nextValue, row.value],
                )
              ).rowCount ?? 0;

        logger.info("Attribute value renamed", {
          id,
          group: row.group_name,
          from: row.value,
          to: nextValue,
          carriersUpdated,
        });

        return { row: updated.rows[0], productsUpdated: carriersUpdated };
      });
    } catch (error) {
      throw handleDatabaseError(error, "renameWithProducts", { id });
    }
  },

  async delete(id) {
    const text = `
      DELETE FROM product_attribute_values
      WHERE id = $1::uuid
      RETURNING id
    `;

    try {
      const result = await query(text, [id]);
      if (result.rowCount === 0) return null;

      logger.info("Attribute value deleted", { id });
      return result.rows[0];
    } catch (error) {
      throw handleDatabaseError(error, "delete", { id });
    }
  },
};
