// src/repository/home_section.repository.js
//
// The home page's one hand-picked section (F-06), admin side.
//
// There is exactly one row that matters — "custom" (030) — addressed by
// slug. Every statement names its columns. A write that replaces a section's pieces runs in one transaction, so
// a section is never left half-saved with the old pieces gone and the new
// ones not yet in.
//
// The public read is not here — it lives in storefront.repository.js with
// the other columns the world may see.

import { query, withTransaction } from "../config/db.js";
import { FIXED_SECTIONS } from "../config/home_section.policy.js";
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

const COLUMNS = `
  s.id,
  s.title,
  s.subtitle,
  s.slug,
  s.position,
  s.created_at,
  s.updated_at,
  (
    SELECT COUNT(*)
    FROM home_section_products hsp
    WHERE hsp.section_id = s.id
  ) AS product_count
`;

/** The picks on one section, in order, with enough of each to list it. */
const PRODUCTS_SQL = `
  SELECT
    p.id,
    p.name,
    p.slug,
    p.active,
    p.current_price
  FROM home_section_products hsp
  JOIN products p ON p.id = hsp.product_id
  WHERE hsp.section_id = $1
  ORDER BY hsp.position ASC
`;

export const HomeSectionRepository = {
  // ==========================================================
  // READS
  // ==========================================================

  /** Both sections, Best sellers first, each with its picks. */
  async list() {
    try {
      const sections = await query(
        `SELECT ${COLUMNS}
         FROM home_sections s
         WHERE s.slug IN ($1)
         ORDER BY s.position ASC, CAST(s.id AS CHAR) ASC`,
        [FIXED_SECTIONS],
      );

      return Promise.all(
        sections.rows.map(async (row) => ({
          ...row,
          products: (await query(PRODUCTS_SQL, [row.id])).rows,
        })),
      );
    } catch (error) {
      throw handleDatabaseError(error, "list");
    }
  },

  /** One section with its picks, or null. */
  async findBySlug(slug) {
    try {
      const section = await query(
        `SELECT ${COLUMNS} FROM home_sections s WHERE s.slug = $1`,
        [slug],
      );

      if (!section.rows[0]) return null;

      const products = await query(PRODUCTS_SQL, [section.rows[0].id]);

      return { ...section.rows[0], products: products.rows };
    } catch (error) {
      throw handleDatabaseError(error, "findBySlug", { slug });
    }
  },

  /** The slugs of the sections one product is in. */
  async sectionsForProduct(productId) {
    try {
      const result = await query(
        `SELECT s.slug
         FROM home_section_products hsp
         JOIN home_sections s ON s.id = hsp.section_id
         WHERE hsp.product_id = $1
           AND s.slug IN ($2)`,
        [productId, FIXED_SECTIONS],
      );

      return result.rows.map((row) => row.slug);
    } catch (error) {
      throw handleDatabaseError(error, "sectionsForProduct", { productId });
    }
  },

  /** How many pieces each section holds, by slug. */
  async counts() {
    try {
      const result = await query(
        `SELECT s.slug, COUNT(hsp.product_id) AS total
         FROM home_sections s
         LEFT JOIN home_section_products hsp ON hsp.section_id = s.id
         WHERE s.slug IN ($1)
         GROUP BY s.slug`,
        [FIXED_SECTIONS],
      );

      return new Map(result.rows.map((row) => [row.slug, row.total]));
    } catch (error) {
      throw handleDatabaseError(error, "counts");
    }
  },

  // ==========================================================
  // WRITES
  // ==========================================================

  /**
   * Replaces a section's name, description and pieces.
   *
   * @returns {Promise<boolean>} false when there is no such section
   */
  async update(slug, fields) {
    return withTransaction(async (client) => {
      // MariaDB has no UPDATE … RETURNING: lock the row and take its id
      // first, then update it by id.
      const found = await client.query(
        "SELECT id FROM home_sections WHERE slug = $1 FOR UPDATE",
        [slug],
      );

      const id = found.rows[0]?.id;
      if (!id) return false;

      await client.query(
        `UPDATE home_sections
         SET title = $2, subtitle = $3, updated_at = NOW(6)
         WHERE id = $1`,
        [id, fields.title, fields.subtitle],
      );

      await client.query(
        "DELETE FROM home_section_products WHERE section_id = $1",
        [id],
      );

      if (fields.productIds.length) {
        // JSON_TABLE's FOR ORDINALITY keeps the array's order, which
        // becomes the position.
        await client.query(
          `INSERT INTO home_section_products (section_id, product_id, position)
           SELECT $1, picked.product_id, picked.ord - 1
           FROM JSON_TABLE($2, '$[*]' COLUMNS (
             ord        FOR ORDINALITY,
             product_id CHAR(36) PATH '$'
           )) AS picked`,
          [id, JSON.stringify(fields.productIds)],
        );
      }

      return true;
    }).catch((error) => {
      throw handleDatabaseError(error, "update", { slug });
    });
  },

  /**
   * Puts one product in exactly the sections named, and takes it out of the
   * other fixed one. A section it joins gets it at the end; a section it was
   * already in keeps it where it was.
   */
  async setProductSections(productId, slugs) {
    return withTransaction(async (client) => {
      // An empty list binds as NULL, and NOT IN (NULL) is never true, so
      // the "not one of these" clause is left out when nothing is named.
      await client.query(
        `DELETE hsp
         FROM home_section_products hsp
         JOIN home_sections s ON s.id = hsp.section_id
         WHERE hsp.product_id = $1
           AND s.slug IN ($2)
           ${slugs.length ? "AND s.slug NOT IN ($3)" : ""}`,
        slugs.length ? [productId, FIXED_SECTIONS, slugs] : [productId, FIXED_SECTIONS],
      );

      if (slugs.length) {
        // The no-op ON DUPLICATE KEY is Postgres's ON CONFLICT DO NOTHING:
        // the primary key (section_id, product_id) is the table's only
        // unique key, so an existing pick is left where it was.
        await client.query(
          `INSERT INTO home_section_products (section_id, product_id, position)
           SELECT s.id, $1,
                  COALESCE((
                    SELECT MAX(hsp.position) + 1
                    FROM home_section_products hsp
                    WHERE hsp.section_id = s.id
                  ), 0)
           FROM home_sections s
           WHERE s.slug IN ($2)
           ON DUPLICATE KEY UPDATE section_id = section_id`,
          [productId, slugs],
        );
      }
    }).catch((error) => {
      throw handleDatabaseError(error, "setProductSections", { productId });
    });
  },
};
