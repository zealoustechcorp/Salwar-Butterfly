// src/repository/size_chart.repository.js
//
// The shop's published size charts (F-06).
//
// A small table read far more often than it is written: the storefront
// asks for it on every page that can open the chart dialog, and the shop
// edits it when a card is reprinted. Every statement here names its
// columns, and the JSONB pair goes in as text with an explicit ::jsonb
// cast — node-postgres would otherwise send a JavaScript array as a
// Postgres array literal, which is a different type and a different
// error every time.

import { query, withTransaction } from "../config/db.js";
import { FIT_GROUP } from "../config/attribute.groups.js";
import { logger } from "../utils/logger.js";

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Size chart repository error: ${operation}`, {
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
  fit,
  title,
  unit,
  column_keys,
  measurements,
  position,
  active,
  created_at,
  updated_at
`;

/**
 * The order every list comes back in, and it is the order the shop
 * prints the charts in.
 *
 * `fit` is the tie-breaker rather than the id: two charts sharing a
 * position is a state an admin can create by adding one, and without a
 * second key Postgres may hand them back in either order — a pair of
 * storefront tabs that swap places between page loads.
 */
const ORDER = "ORDER BY position ASC, fit ASC";

export const SizeChartRepository = {
  /**
   * Every chart, published or not — the admin screen's list.
   */
  async list() {
    try {
      const result = await query(`SELECT ${COLUMNS} FROM size_charts ${ORDER}`);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "list");
    }
  },

  /** Just the ones the storefront may print. */
  async listActive() {
    try {
      const result = await query(
        `SELECT ${COLUMNS} FROM size_charts WHERE active ${ORDER}`,
      );
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "listActive");
    }
  },

  async findById(id) {
    try {
      const result = await query(
        `SELECT ${COLUMNS} FROM size_charts WHERE id = $1::uuid`,
        [id],
      );

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findById", { id });
    }
  },

  /**
   * A chart by the name it is chosen by.
   *
   * Case-insensitive, because "slim fit" and "Slim Fit" are one fit to
   * everybody but a UNIQUE index, and the shop should be told it already
   * has that chart rather than ending up with two tabs that differ by a
   * capital letter.
   *
   * `exceptId` is for the edit path: a chart may keep its own name.
   */
  async findByFit(fit, exceptId = null) {
    const text = exceptId
      ? `SELECT ${COLUMNS} FROM size_charts
         WHERE lower(fit) = lower($1) AND id <> $2::uuid`
      : `SELECT ${COLUMNS} FROM size_charts WHERE lower(fit) = lower($1)`;

    try {
      const result = await query(
        text,
        exceptId ? [fit, exceptId] : [fit],
      );

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findByFit", { fit });
    }
  },

  /**
   * Where a new chart lands when the caller did not say.
   *
   * Last, after everything the shop already prints. A new fit is not
   * more important than the two charts most shoppers came for, and an
   * admin who wants it first can move it.
   */
  async nextPosition() {
    try {
      const result = await query(
        "SELECT COALESCE(MAX(position), 0) + 1 AS next FROM size_charts",
      );

      return result.rows[0]?.next ?? 1;
    } catch (error) {
      throw handleDatabaseError(error, "nextPosition");
    }
  },

  async create(chart) {
    const text = `
      INSERT INTO size_charts (
        fit, title, unit, column_keys, measurements, position, active
      )
      VALUES (
        $1, $2, $3, $4::jsonb, $5::jsonb, $6, $7
      )
      RETURNING ${COLUMNS}
    `;

    try {
      const result = await query(text, [
        chart.fit,
        chart.title,
        chart.unit,
        JSON.stringify(chart.columns),
        JSON.stringify(chart.rows),
        chart.position,
        chart.active,
      ]);

      return result.rows[0];
    } catch (error) {
      throw handleDatabaseError(error, "create", { fit: chart.fit });
    }
  },

  /**
   * Replaces a chart.
   *
   * A full replace rather than a patch, for the reason the address book
   * gives: the caller is an editor that already holds every field, and a
   * per-column COALESCE could not tell "leave the shoulder column alone"
   * from "drop the shoulder column", which is a real edit.
   *
   * Returns null when the id names nothing.
   */
  async update(id, chart) {
    const text = `
      UPDATE size_charts
      SET fit          = $2,
          title        = $3,
          unit         = $4,
          column_keys  = $5::jsonb,
          measurements = $6::jsonb,
          position     = $7,
          active       = $8,
          updated_at   = NOW()
      WHERE id = $1::uuid
      RETURNING ${COLUMNS}
    `;

    try {
      const result = await query(text, [
        id,
        chart.fit,
        chart.title,
        chart.unit,
        JSON.stringify(chart.columns),
        JSON.stringify(chart.rows),
        chart.position,
        chart.active,
      ]);

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "update", { id });
    }
  },

  /**
   * Takes a chart off the storefront, or puts it back.
   *
   * Its own statement rather than a trip through the editor: hiding a
   * chart is a toggle in a row, and routing it through `update` would
   * mean sending a whole measurement table to change one boolean.
   */
  async setActive(id, active) {
    try {
      const result = await query(
        `UPDATE size_charts
         SET active = $2, updated_at = NOW()
         WHERE id = $1::uuid
         RETURNING ${COLUMNS}`,
        [id, active],
      );

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "setActive", { id });
    }
  },

  /**
   * Rewrites the print order from a list of ids.
   *
   * One transaction, because a half-applied reorder is a pair of charts
   * sharing a position — which the ORDER above resolves by name, so the
   * shop would see the tabs settle somewhere it did not ask for.
   *
   * Ids that name nothing are simply not updated; the service has
   * already established that the list is the whole set.
   */
  async reorder(ids) {
    return withTransaction(async (client) => {
      for (const [index, id] of ids.entries()) {
        await client.query(
          `UPDATE size_charts
           SET position = $2, updated_at = NOW()
           WHERE id = $1::uuid`,
          [id, index + 1],
        );
      }

      const result = await client.query(
        `SELECT ${COLUMNS} FROM size_charts ${ORDER}`,
      );

      return result.rows;
    }).catch((error) => {
      throw handleDatabaseError(error, "reorder", { count: ids.length });
    });
  },

  /**
   * How many products are cut to a fit — what a chart's delete has to
   * answer for.
   *
   * There is no foreign key: a product names its chart by the string in
   * `attributes.fit`, matched case-insensitively the way findByFit does.
   */
  async countProductsWithFit(fit) {
    try {
      const result = await query(
        `SELECT COUNT(*)::INTEGER AS count
         FROM products
         WHERE lower(attributes->>'${FIT_GROUP}') = lower($1)`,
        [fit],
      );

      return result.rows[0]?.count ?? 0;
    } catch (error) {
      throw handleDatabaseError(error, "countProductsWithFit", { fit });
    }
  },

  /**
   * Removes a chart outright — but only one no product is cut to.
   *
   * Nothing points at these rows by id, but products point at them by
   * fit: deleting the chart a product's `attributes.fit` names leaves
   * that product's size guide falling back to every chart, and (before
   * resolveFit learned to accept an unchanged fit) made the product
   * unsaveable. The emptiness is part of the DELETE, so a product given
   * this fit after the service counted still stops it. Hiding without
   * destroying is what `setActive` is for, and it is the gesture the
   * admin table offers first.
   *
   * @returns {Promise<boolean>} false when nothing was deleted — the
   *          chart is gone, or is in use; the service tells which
   */
  async remove(id) {
    try {
      const result = await query(
        `DELETE FROM size_charts sc
         WHERE sc.id = $1::uuid
           AND NOT EXISTS (
             SELECT 1 FROM products p
             WHERE lower(p.attributes->>'${FIT_GROUP}') = lower(sc.fit)
           )
         RETURNING sc.id`,
        [id],
      );

      return result.rowCount > 0;
    } catch (error) {
      throw handleDatabaseError(error, "remove", { id });
    }
  },
};
