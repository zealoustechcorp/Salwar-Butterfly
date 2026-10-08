// src/repository/customer_story.repository.js
//
// What customers have sent the shop (F-06.08).
//
// A small table read on every home page render and written whenever the
// shop has a new message worth publishing. Every statement names its
// columns, and every id is cast explicitly.
//
// The admin list joins `products` for the name of the piece a story
// points at. That join is LEFT and unfiltered by `active`: the admin
// screen must be able to say "this card links to a piece that is no
// longer on sale", which it cannot do if the row comes back looking
// exactly like one that names no product at all.

import { query, withTransaction } from "../config/db.js";
import { logger } from "../utils/logger.js";

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Customer story repository error: ${operation}`, {
    operation,
    ...context,
    code: error?.code,
    constraint: error?.constraint,
    message: error?.message,
  });

  return error;
};

/** Every column the admin API returns. Named, never `SELECT *`. */
const COLUMNS = `
  cs.id,
  cs.customer_name,
  cs.body,
  cs.image,
  cs.image_public_id,
  cs.product_id,
  cs.position,
  cs.published,
  cs.created_at,
  cs.updated_at,
  p.name   AS product_name,
  p.active AS product_active
`;

const FROM = `
  FROM customer_stories cs
  LEFT JOIN products p ON p.id = cs.product_id
`;

/**
 * The order every list comes back in, which is the order the cards are
 * shown in.
 *
 * `created_at DESC` breaks the tie rather than ascending, and that is
 * the one place this table differs from banners: two stories sharing a
 * position should settle newest-first, matching the front-insert rule
 * that put them there.
 */
const ORDER = "ORDER BY cs.position ASC, cs.created_at DESC, cs.id ASC";

export const CustomerStoryRepository = {
  // ==========================================================
  // READS
  // ==========================================================

  /** Every story, published or not — the admin screen's list. */
  async list() {
    try {
      const result = await query(`SELECT ${COLUMNS} ${FROM} ${ORDER}`);

      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "list");
    }
  },

  async findById(id) {
    try {
      const result = await query(
        `SELECT ${COLUMNS} ${FROM} WHERE cs.id = $1::uuid`,
        [id],
      );

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findById", { id });
    }
  },

  /** How many stories the shop is holding, published and hidden together. */
  async count() {
    try {
      const result = await query(
        "SELECT COUNT(*)::INTEGER AS total FROM customer_stories",
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
   * Inserts rows at the front of the order.
   *
   * Takes a list rather than one row because the way in is a batch: the
   * shop drops a set of photographs in at once, and renumbering the
   * table once for the whole set is both cheaper and the only way the
   * batch keeps the order it was picked in.
   *
   * Everything already in the table is pushed back by the number of new
   * rows, and the new ones take 1..N in the order given. One
   * transaction: a half-applied shift is a set of stories sharing
   * positions, which the ORDER above then settles by date rather than by
   * anything the shop chose.
   *
   * @param {Array<object>} stories rows to insert, in the order they
   *        should appear
   */
  async createManyAtFront(stories) {
    return withTransaction(async (client) => {
      await client.query(
        "UPDATE customer_stories SET position = position + $1",
        [stories.length],
      );

      for (const [index, story] of stories.entries()) {
        await client.query(
          `INSERT INTO customer_stories (
             customer_name, body, image, image_public_id, product_id, position
           )
           VALUES ($1, $2, $3, $4, $5::uuid, $6)`,
          [
            story.customerName ?? null,
            story.body ?? null,
            story.image ?? null,
            story.imagePublicId ?? null,
            story.productId ?? null,
            index + 1,
          ],
        );
      }

      const result = await client.query(`SELECT ${COLUMNS} ${FROM} ${ORDER}`);

      return result.rows;
    }).catch((error) => {
      throw handleDatabaseError(error, "createManyAtFront", {
        count: stories.length,
      });
    });
  },

  /**
   * Replaces a story's typed fields.
   *
   * A full replace of the three rather than a per-column COALESCE, which
   * could not tell "leave the name alone" from "clear the name" — and
   * clearing one is a real edit, since a story published without a name
   * is the ordinary case.
   *
   * The image is not touched here. It has its own statement, because a
   * correction to a quote should not require re-uploading a photograph.
   */
  async updateFields(id, fields) {
    try {
      const result = await query(
        `UPDATE customer_stories
         SET customer_name = $2,
             body          = $3,
             product_id    = $4::uuid,
             updated_at    = NOW()
         WHERE id = $1::uuid
         RETURNING id`,
        [id, fields.customerName ?? null, fields.body ?? null, fields.productId ?? null],
      );

      if (!result.rows[0]) return null;

      return CustomerStoryRepository.findById(id);
    } catch (error) {
      throw handleDatabaseError(error, "updateFields", { id });
    }
  },

  /** Swaps a story's photograph for a newly uploaded one. */
  async replaceImage(id, image) {
    try {
      const result = await query(
        `UPDATE customer_stories
         SET image           = $2,
             image_public_id = $3,
             updated_at      = NOW()
         WHERE id = $1::uuid
         RETURNING id`,
        [id, image.imageUrl, image.imagePublicId],
      );

      if (!result.rows[0]) return null;

      return CustomerStoryRepository.findById(id);
    } catch (error) {
      throw handleDatabaseError(error, "replaceImage", { id });
    }
  },

  /** Takes a story off the home page, or puts it back. */
  async setPublished(id, published) {
    try {
      const result = await query(
        `UPDATE customer_stories
         SET published = $2, updated_at = NOW()
         WHERE id = $1::uuid
         RETURNING id`,
        [id, published],
      );

      if (!result.rows[0]) return null;

      return CustomerStoryRepository.findById(id);
    } catch (error) {
      throw handleDatabaseError(error, "setPublished", { id });
    }
  },

  /**
   * Rewrites the order from a list of ids.
   *
   * One transaction, because a half-applied reorder is a pair of stories
   * sharing a position, which the ORDER above then settles by date —
   * somewhere the shop did not choose.
   */
  async reorder(ids) {
    return withTransaction(async (client) => {
      for (const [index, id] of ids.entries()) {
        await client.query(
          `UPDATE customer_stories
           SET position = $2, updated_at = NOW()
           WHERE id = $1::uuid`,
          [id, index + 1],
        );
      }

      const result = await client.query(`SELECT ${COLUMNS} ${FROM} ${ORDER}`);

      return result.rows;
    }).catch((error) => {
      throw handleDatabaseError(error, "reorder", { count: ids.length });
    });
  },

  /**
   * Removes a story outright.
   *
   * Returns the row rather than a boolean, because the caller needs the
   * `image_public_id` off it to delete the file from Cloudinary — and
   * after this statement there is nowhere left to read it from.
   */
  async remove(id) {
    try {
      const result = await query(
        `DELETE FROM customer_stories
         WHERE id = $1::uuid
         RETURNING id, image_public_id`,
        [id],
      );

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "remove", { id });
    }
  },
};
