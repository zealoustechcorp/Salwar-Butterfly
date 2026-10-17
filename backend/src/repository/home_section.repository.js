// src/repository/home_section.repository.js
//
// The hand-picked shelves on the home page (F-06), admin side.
//
// Every statement names its columns and casts its ids. Writes that touch a
// shelf and its picks together run in one transaction, so a shelf is never
// left half-saved with the old pieces gone and the new ones not yet in.
//
// The public read is not here — it lives in storefront.repository.js with
// the other columns the world may see.

import { query, withTransaction } from "../config/db.js";
import { logger } from "../utils/logger.js";

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Home section repository error: ${operation}`, {
    operation,
    ...context,
    code: error?.code,
    constraint: error?.constraint,
    message: error?.message,
  });

  return error;
};

/**
 * Every column the admin API returns, plus two derived ones:
 *
 *   product_count  how many pieces are picked, on sale or not
 *   is_live        whether the home page shows it right now — active and
 *                  inside its window, judged on the database clock so the
 *                  admin screen and the storefront agree on the boundary
 */
const COLUMNS = `
  s.id,
  s.title,
  s.subtitle,
  s.slug,
  s.starts_at,
  s.ends_at,
  s.position,
  s.active,
  s.created_at,
  s.updated_at,
  (
    SELECT COUNT(*)::INTEGER
    FROM home_section_products hsp
    WHERE hsp.section_id = s.id
  ) AS product_count,
  (
    s.active
    AND (s.starts_at IS NULL OR s.starts_at <= NOW())
    AND (s.ends_at IS NULL OR s.ends_at > NOW())
  ) AS is_live
`;

const ORDER = "ORDER BY s.position ASC, s.created_at ASC, s.id ASC";

/** The picks on one shelf, with enough of each product to list it. */
const PRODUCTS_SQL = `
  SELECT
    p.id,
    p.name,
    p.slug,
    p.active,
    p.current_price
  FROM home_section_products hsp
  JOIN products p ON p.id = hsp.product_id
  WHERE hsp.section_id = $1::uuid
  ORDER BY hsp.position ASC
`;

/** Replaces a shelf's picks with `productIds`, in that order. */
const writeProducts = async (client, sectionId, productIds) => {
  await client.query(
    "DELETE FROM home_section_products WHERE section_id = $1::uuid",
    [sectionId],
  );

  if (!productIds.length) return;

  // One statement for the lot: unnest keeps the array's order as the
  // ordinality, which becomes the position.
  await client.query(
    `INSERT INTO home_section_products (section_id, product_id, position)
     SELECT $1::uuid, picked.product_id, picked.ord - 1
     FROM unnest($2::uuid[]) WITH ORDINALITY AS picked(product_id, ord)`,
    [sectionId, productIds],
  );
};

export const HomeSectionRepository = {
  // ==========================================================
  // READS
  // ==========================================================

  /** Every shelf, live or not — the admin screen's list. */
  async list() {
    try {
      const result = await query(
        `SELECT ${COLUMNS} FROM home_sections s ${ORDER}`,
      );

      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "list");
    }
  },

  /** One shelf with its picks, or null. */
  async findById(id) {
    try {
      const [section, products] = await Promise.all([
        query(`SELECT ${COLUMNS} FROM home_sections s WHERE s.id = $1::uuid`, [
          id,
        ]),
        query(PRODUCTS_SQL, [id]),
      ]);

      if (!section.rows[0]) return null;

      return { ...section.rows[0], products: products.rows };
    } catch (error) {
      throw handleDatabaseError(error, "findById", { id });
    }
  },

  async count() {
    try {
      const result = await query(
        "SELECT COUNT(*)::INTEGER AS total FROM home_sections",
      );

      return result.rows[0]?.total ?? 0;
    } catch (error) {
      throw handleDatabaseError(error, "count");
    }
  },

  // ==========================================================
  // WRITES
  // ==========================================================

  /**
   * Creates a shelf at the end of the stack, with its picks.
   *
   * @returns {Promise<string>} the new shelf's id
   */
  async create(fields) {
    return withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO home_sections (
           title, subtitle, slug, starts_at, ends_at, active, position
         )
         VALUES (
           $1, $2, $3, $4::timestamptz, $5::timestamptz, $6,
           (SELECT COALESCE(MAX(position), 0) + 1 FROM home_sections)
         )
         RETURNING id`,
        [
          fields.title,
          fields.subtitle,
          fields.slug,
          fields.startsAt,
          fields.endsAt,
          fields.active,
        ],
      );

      const id = result.rows[0].id;

      await writeProducts(client, id, fields.productIds);

      return id;
    }).catch((error) => {
      throw handleDatabaseError(error, "create", { slug: fields.slug });
    });
  },

  /**
   * Replaces a shelf's fields and its picks.
   *
   * A full replace rather than a patch, for the reason the stories give:
   * clearing a subtitle or an end date is a real edit, and an omitted
   * field could not be told apart from it.
   *
   * @returns {Promise<boolean>} false when there is no such shelf
   */
  async update(id, fields) {
    return withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE home_sections
         SET title      = $2,
             subtitle   = $3,
             slug       = $4,
             starts_at  = $5::timestamptz,
             ends_at    = $6::timestamptz,
             active     = $7,
             updated_at = NOW()
         WHERE id = $1::uuid
         RETURNING id`,
        [
          id,
          fields.title,
          fields.subtitle,
          fields.slug,
          fields.startsAt,
          fields.endsAt,
          fields.active,
        ],
      );

      if (!result.rows[0]) return false;

      await writeProducts(client, id, fields.productIds);

      return true;
    }).catch((error) => {
      throw handleDatabaseError(error, "update", { id });
    });
  },

  /** The switch in the admin row. */
  async setActive(id, active) {
    try {
      const result = await query(
        `UPDATE home_sections
         SET active = $2, updated_at = NOW()
         WHERE id = $1::uuid
         RETURNING id`,
        [id, active],
      );

      return Boolean(result.rows[0]);
    } catch (error) {
      throw handleDatabaseError(error, "setActive", { id });
    }
  },

  /** Rewrites the stacking order from a complete list of ids. */
  async reorder(ids) {
    return withTransaction(async (client) => {
      for (const [index, id] of ids.entries()) {
        await client.query(
          `UPDATE home_sections
           SET position = $2, updated_at = NOW()
           WHERE id = $1::uuid`,
          [id, index + 1],
        );
      }
    }).catch((error) => {
      throw handleDatabaseError(error, "reorder", { count: ids.length });
    });
  },

  /**
   * Deletes a shelf; its picks go with it (ON DELETE CASCADE).
   *
   * @returns {Promise<boolean>} false when there was no such shelf
   */
  async remove(id) {
    try {
      const result = await query(
        "DELETE FROM home_sections WHERE id = $1::uuid RETURNING id",
        [id],
      );

      return Boolean(result.rows[0]);
    } catch (error) {
      throw handleDatabaseError(error, "remove", { id });
    }
  },
};
