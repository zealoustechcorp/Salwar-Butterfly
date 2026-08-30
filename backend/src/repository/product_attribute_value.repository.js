import { query, withTransaction } from "../config/db.js";
import { logger } from "../utils/logger.js";

const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: "23505",
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

  return error;
};

/**
 * How many products currently carry a given value, counted straight off
 * `products.attributes`. There is no foreign key between the two — the
 * register curates what may be chosen, it does not own what was already
 * chosen — so this is the only way to know what a rename or a delete
 * would touch.
 */
const USAGE_COUNT = `
  (
    SELECT COUNT(*)::INTEGER
    FROM products p
    WHERE p.attributes ->> av.group_name = av.value
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

  async create({ groupName, value, active = true, position = null }) {
    // Appended to the end of its group unless a position is given.
    const text = `
      INSERT INTO product_attribute_values (
        group_name, value, active, position, created_at, updated_at
      )
      VALUES (
        $1::varchar, $2::varchar, $3::boolean,
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
      const result = await query(text, [groupName, value, active, position]);

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
   * Renames a value in the register and on every product carrying it, in
   * one transaction.
   *
   * Without the second step a rename would orphan the products still
   * holding the old string: they would show a value the register no
   * longer offers, and the new name would report zero usage.
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

        const products = await client.query(
          `UPDATE products
              SET attributes = jsonb_set(attributes, ARRAY[$1::text], to_jsonb($2::text)),
                  updated_at = NOW()
            WHERE attributes ->> $1 = $3
        RETURNING id`,
          [row.group_name, nextValue, row.value],
        );

        logger.info("Attribute value renamed", {
          id,
          from: row.value,
          to: nextValue,
          productsUpdated: products.rowCount,
        });

        return { row: updated.rows[0], productsUpdated: products.rowCount ?? 0 };
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
