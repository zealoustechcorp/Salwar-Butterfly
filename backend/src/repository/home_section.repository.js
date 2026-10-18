// src/repository/home_section.repository.js
//
// The home page's one hand-picked section (F-06), admin side.
//
// There is exactly one row that matters — "custom" (030) — addressed by
// slug. Every statement names its columns and casts its
// ids. A write that replaces a section's pieces runs in one transaction, so
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
    SELECT COUNT(*)::INTEGER
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
  WHERE hsp.section_id = $1::uuid
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
         WHERE s.slug = ANY($1::text[])
         ORDER BY s.position ASC, s.id ASC`,
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
         WHERE hsp.product_id = $1::uuid
           AND s.slug = ANY($2::text[])`,
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
        `SELECT s.slug, COUNT(hsp.product_id)::INTEGER AS total
         FROM home_sections s
         LEFT JOIN home_section_products hsp ON hsp.section_id = s.id
         WHERE s.slug = ANY($1::text[])
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
      const result = await client.query(
        `UPDATE home_sections
         SET title = $2, subtitle = $3, updated_at = NOW()
         WHERE slug = $1
         RETURNING id`,
        [slug, fields.title, fields.subtitle],
      );

      const id = result.rows[0]?.id;
      if (!id) return false;

      await client.query(
        "DELETE FROM home_section_products WHERE section_id = $1::uuid",
        [id],
      );

      if (fields.productIds.length) {
        // unnest keeps the array's order as the ordinality, which becomes
        // the position.
        await client.query(
          `INSERT INTO home_section_products (section_id, product_id, position)
           SELECT $1::uuid, picked.product_id, picked.ord - 1
           FROM unnest($2::uuid[]) WITH ORDINALITY AS picked(product_id, ord)`,
          [id, fields.productIds],
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
      await client.query(
        `DELETE FROM home_section_products hsp
         USING home_sections s
         WHERE s.id = hsp.section_id
           AND hsp.product_id = $1::uuid
           AND s.slug = ANY($2::text[])
           AND NOT (s.slug = ANY($3::text[]))`,
        [productId, FIXED_SECTIONS, slugs],
      );

      if (slugs.length) {
        await client.query(
          `INSERT INTO home_section_products (section_id, product_id, position)
           SELECT s.id, $1::uuid,
                  COALESCE((
                    SELECT MAX(hsp.position) + 1
                    FROM home_section_products hsp
                    WHERE hsp.section_id = s.id
                  ), 0)
           FROM home_sections s
           WHERE s.slug = ANY($2::text[])
           ON CONFLICT (section_id, product_id) DO NOTHING`,
          [productId, slugs],
        );
      }
    }).catch((error) => {
      throw handleDatabaseError(error, "setProductSections", { productId });
    });
  },
};
