// src/repository/banner.repository.js
//
// The home page carousel (F-06).
//
// A small table read on every home page render and written a few times a
// season. Every statement names its columns, and every id is cast
// explicitly — an id arriving as text against a UUID column is a
// different error on every driver version.

import { query, withTransaction } from "../config/db.js";
import { logger } from "../utils/logger.js";

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Banner repository error: ${operation}`, {
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
  image,
  image_public_id,
  position,
  active,
  created_at,
  updated_at
`;

/**
 * The order every list comes back in, which is the order the carousel
 * rotates.
 *
 * `created_at` and then `id` break the tie rather than nothing at all.
 * Two banners sharing a position is a state an admin can create by
 * uploading a batch while another screen is mid-reorder, and without a
 * second key Postgres may hand them back in either order — a pair of
 * slides that swap places between page loads.
 *
 * A banner has no name to sort by, which is why this is the timestamp
 * and not the alphabetical fallback the size charts use.
 */
const ORDER = "ORDER BY position ASC, created_at ASC, id ASC";

export const BannerRepository = {
  // ==========================================================
  // READS
  // ==========================================================

  /** Every banner, live or hidden — the admin screen's list. */
  async list() {
    try {
      const result = await query(`SELECT ${COLUMNS} FROM banners ${ORDER}`);

      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "list");
    }
  },

  async findById(id) {
    try {
      const result = await query(
        `SELECT ${COLUMNS} FROM banners WHERE id = $1::uuid`,
        [id],
      );

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findById", { id });
    }
  },

  /**
   * How many slides the shop is holding, live and hidden together.
   *
   * What the service checks the upload against. A COUNT rather than
   * `list().length`, because the ceiling is the only thing being asked
   * and the rows would be thrown away.
   */
  async count() {
    try {
      const result = await query("SELECT COUNT(*)::INTEGER AS total FROM banners");

      return result.rows[0]?.total ?? 0;
    } catch (error) {
      throw handleDatabaseError(error, "count");
    }
  },

  // ==========================================================
  // WRITES
  // ==========================================================

  /**
   * Adds a batch of already-uploaded images to the end of the carousel.
   *
   * Takes `{ imageUrl, imagePublicId }` — the shape CloudinaryStorage
   * hands back — because by the time this runs the files are already on
   * Cloudinary. The service is what puts them there, and what deletes
   * them again if this throws.
   *
   * One transaction, and the positions are read inside it. Two admins
   * uploading at the same moment would otherwise both read the same
   * `MAX(position)` and both append at it, which is two slides at
   * position 6 and an order that settles by timestamp. The whole batch
   * lands or none of it does.
   */
  async createMany(images) {
    return withTransaction(async (client) => {
      const start = await client.query(
        "SELECT COALESCE(MAX(position), 0) AS last FROM banners",
      );

      const last = Number(start.rows[0]?.last ?? 0);

      for (const [index, image] of images.entries()) {
        await client.query(
          `INSERT INTO banners (image, image_public_id, position)
           VALUES ($1, $2, $3)`,
          [image.imageUrl, image.imagePublicId, last + index + 1],
        );
      }

      const result = await client.query(
        `SELECT ${COLUMNS} FROM banners ${ORDER}`,
      );

      return result.rows;
    }).catch((error) => {
      throw handleDatabaseError(error, "createMany", { count: images.length });
    });
  },

  /**
   * Swaps one slide's artwork, leaving it where it is in the order.
   *
   * Returns null when the id names nothing.
   */
  async replaceImage(id, image) {
    try {
      const result = await query(
        `UPDATE banners
         SET image           = $2,
             image_public_id = $3,
             updated_at      = NOW()
         WHERE id = $1::uuid
         RETURNING ${COLUMNS}`,
        [id, image.imageUrl, image.imagePublicId],
      );

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "replaceImage", { id });
    }
  },

  /**
   * Takes a slide out of the rotation, or puts it back.
   *
   * Its own statement rather than a trip through a general update: this
   * is a toggle in a row, and it is the only write the admin screen
   * makes without a file attached.
   */
  async setActive(id, active) {
    try {
      const result = await query(
        `UPDATE banners
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
   * Rewrites the rotation order from a list of ids.
   *
   * One transaction, because a half-applied reorder is a pair of slides
   * sharing a position — which the ORDER above then resolves by
   * timestamp, so the shop would watch the carousel settle somewhere it
   * did not ask for.
   *
   * Ids that name nothing are simply not updated; the service has
   * already established that the list is the whole set.
   */
  async reorder(ids) {
    return withTransaction(async (client) => {
      for (const [index, id] of ids.entries()) {
        await client.query(
          `UPDATE banners
           SET position = $2, updated_at = NOW()
           WHERE id = $1::uuid`,
          [id, index + 1],
        );
      }

      const result = await client.query(
        `SELECT ${COLUMNS} FROM banners ${ORDER}`,
      );

      return result.rows;
    }).catch((error) => {
      throw handleDatabaseError(error, "reorder", { count: ids.length });
    });
  },

  /**
   * Removes a banner outright.
   *
   * Returns the row rather than a boolean, because the caller needs the
   * `image_public_id` off it to delete the file from Cloudinary — and
   * after this statement there is nowhere left to read it from.
   *
   * A hard delete, and nothing points at these rows: a banner is read by
   * position on the storefront and by id only inside the admin screen,
   * so there is no order or product left dangling. Hiding without
   * destroying is what `setActive` is for, and it is the gesture the
   * admin screen offers first.
   */
  async remove(id) {
    try {
      const result = await query(
        `DELETE FROM banners WHERE id = $1::uuid RETURNING ${COLUMNS}`,
        [id],
      );

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "remove", { id });
    }
  },
};
