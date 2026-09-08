// src/repository/customer_address.repository.js
//
// The address book (F-05.03, F-08.05).
//
// Every statement here is scoped by customer_id, including the ones that
// already have an address id in hand. `WHERE id = $1 AND customer_id =
// $2` rather than a lookup followed by an ownership check, because the
// two-step version has a window between the read and the write, and
// because a query that cannot express "somebody else's address" is a
// better guarantee than one that is merely checked before use.
//
// The consequence is that editing an address that belongs to another
// account looks exactly like editing one that does not exist: zero rows.
// The service turns both into the same 404, which is also the right
// answer — telling the caller "that address exists but is not yours"
// confirms the id.

import { query, withTransaction } from "../config/db.js";
import { logger } from "../utils/logger.js";

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Customer address repository error: ${operation}`, {
    operation,
    ...context,
    code: error?.code,
    constraint: error?.constraint,
    message: error?.message,
  });

  return error;
};

/** Every column the API ever returns. Named, never `SELECT *`. */
const COLUMNS = `
  id,
  customer_id,
  label,
  line1,
  line2,
  landmark,
  city,
  state,
  postal_code,
  country,
  is_default,
  created_at,
  updated_at
`;

export const CustomerAddressRepository = {
  /**
   * One shopper's addresses, default first then oldest.
   *
   * The order matters: it is the order the picker renders in, and the
   * first row is what checkout preselects when the shopper has no
   * default set.
   */
  async listByCustomer(customerId) {
    const text = `
      SELECT ${COLUMNS}
      FROM customer_addresses
      WHERE customer_id = $1::uuid
      ORDER BY is_default DESC, created_at
    `;

    try {
      const result = await query(text, [customerId]);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "listByCustomer", { customerId });
    }
  },

  async countByCustomer(customerId) {
    try {
      const result = await query(
        `SELECT COUNT(*)::int AS total
         FROM customer_addresses
         WHERE customer_id = $1::uuid`,
        [customerId],
      );

      return result.rows[0]?.total ?? 0;
    } catch (error) {
      throw handleDatabaseError(error, "countByCustomer", { customerId });
    }
  },

  /** One address, or null when it does not exist or is not theirs. */
  async findById(customerId, id) {
    const text = `
      SELECT ${COLUMNS}
      FROM customer_addresses
      WHERE id = $1::uuid AND customer_id = $2::uuid
    `;

    try {
      const result = await query(text, [id, customerId]);
      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findById", { customerId, id });
    }
  },

  /**
   * Writes a new address.
   *
   * In a transaction because making this one the default means unmaking
   * whichever one held that flag, and the partial unique index in 013
   * refuses the pair in the wrong order. Two statements that must both
   * land or neither.
   */
  async create(customerId, address) {
    return withTransaction(async (client) => {
      if (address.isDefault) {
        await client.query(
          `UPDATE customer_addresses
           SET is_default = FALSE, updated_at = NOW()
           WHERE customer_id = $1::uuid AND is_default`,
          [customerId],
        );
      }

      const text = `
        INSERT INTO customer_addresses (
          customer_id, label, line1, line2, landmark,
          city, state, postal_code, country, is_default
        )
        VALUES (
          $1::uuid, $2, $3, $4, $5,
          $6, $7, $8, $9, $10
        )
        RETURNING ${COLUMNS}
      `;

      const result = await client.query(text, [
        customerId,
        address.label,
        address.line1,
        address.line2,
        address.landmark,
        address.city,
        address.state,
        address.postalCode,
        address.country,
        address.isDefault,
      ]);

      return result.rows[0];
    }).catch((error) => {
      throw handleDatabaseError(error, "create", { customerId });
    });
  },

  /**
   * Replaces an address.
   *
   * A full replace rather than a patch: the caller is a form that
   * already holds every field, and a partial update would need a COALESCE
   * per column that could not tell "leave the landmark alone" from
   * "clear the landmark", which is a real thing shoppers do.
   *
   * Returns null when nothing matched — no row, or not theirs.
   */
  async update(customerId, id, address) {
    return withTransaction(async (client) => {
      if (address.isDefault) {
        await client.query(
          `UPDATE customer_addresses
           SET is_default = FALSE, updated_at = NOW()
           WHERE customer_id = $1::uuid AND is_default AND id <> $2::uuid`,
          [customerId, id],
        );
      }

      const text = `
        UPDATE customer_addresses
        SET label       = $3,
            line1       = $4,
            line2       = $5,
            landmark    = $6,
            city        = $7,
            state       = $8,
            postal_code = $9,
            country     = $10,
            is_default  = $11,
            updated_at  = NOW()
        WHERE id = $1::uuid AND customer_id = $2::uuid
        RETURNING ${COLUMNS}
      `;

      const result = await client.query(text, [
        id,
        customerId,
        address.label,
        address.line1,
        address.line2,
        address.landmark,
        address.city,
        address.state,
        address.postalCode,
        address.country,
        address.isDefault,
      ]);

      return result.rows[0] ?? null;
    }).catch((error) => {
      throw handleDatabaseError(error, "update", { customerId, id });
    });
  },

  /**
   * Makes one address the default and clears the rest.
   *
   * Both statements or neither, for the index reason above.
   *
   * Returns null when the id names nothing of theirs, and the clearing
   * UPDATE is ordered second so that a bad id does not leave the shopper
   * with no default at all.
   */
  async setDefault(customerId, id) {
    return withTransaction(async (client) => {
      const cleared = await client.query(
        `UPDATE customer_addresses
         SET is_default = FALSE, updated_at = NOW()
         WHERE customer_id = $1::uuid AND is_default AND id <> $2::uuid`,
        [customerId, id],
      );

      const result = await client.query(
        `UPDATE customer_addresses
         SET is_default = TRUE, updated_at = NOW()
         WHERE id = $1::uuid AND customer_id = $2::uuid
         RETURNING ${COLUMNS}`,
        [id, customerId],
      );

      const row = result.rows[0] ?? null;

      // Nothing answered to that id. Undo the clearing by failing the
      // transaction rather than by writing the old flag back — the
      // rollback already knows which row held it.
      if (!row && cleared.rowCount > 0) {
        throw Object.assign(new Error("ADDRESS_NOT_FOUND"), {
          notFound: true,
        });
      }

      return row;
    }).catch((error) => {
      if (error?.notFound) return null;

      throw handleDatabaseError(error, "setDefault", { customerId, id });
    });
  },

  /**
   * Removes an address.
   *
   * A hard delete, unlike customers. Orders keep their own snapshot of
   * where they were sent (see 008), so nothing downstream loses its
   * history when a shopper deletes an address they have moved out of —
   * and keeping a dead address around means keeping personal data for a
   * place the shopper has told the shop to forget.
   *
   * When the deleted row was the default, the oldest survivor takes over.
   * The alternative is an account with three addresses and no default,
   * where checkout preselects nothing for no reason the shopper can see.
   */
  async remove(customerId, id) {
    return withTransaction(async (client) => {
      const deleted = await client.query(
        `DELETE FROM customer_addresses
         WHERE id = $1::uuid AND customer_id = $2::uuid
         RETURNING is_default`,
        [id, customerId],
      );

      if (deleted.rowCount === 0) return false;

      if (deleted.rows[0].is_default) {
        await client.query(
          `UPDATE customer_addresses
           SET is_default = TRUE, updated_at = NOW()
           WHERE id = (
             SELECT id
             FROM customer_addresses
             WHERE customer_id = $1::uuid
             ORDER BY created_at
             LIMIT 1
           )`,
          [customerId],
        );
      }

      return true;
    }).catch((error) => {
      throw handleDatabaseError(error, "remove", { customerId, id });
    });
  },
};
