// src/repository/wishlist.repository.js
//
// Saved pieces (F-07).
//
// The simplest repository in the project, and it should stay that way.
// Every write is idempotent by construction — ON CONFLICT DO NOTHING
// against the unique constraint in 011 — because the thing driving them
// is a heart icon on a card, and a heart icon gets double-tapped.
//
// Reads return product ids and nothing else. The storefront already
// holds the whole catalogue (see storefront.service.js), so sending
// names, prices and photos back here would be re-sending data the page
// has in memory, and would give a saved piece two sources of truth for
// its price.

import { query } from "../config/db.js";
import { logger } from "../utils/logger.js";

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Wishlist repository error: ${operation}`, {
    operation,
    ...context,
    code: error?.code,
    constraint: error?.constraint,
    message: error?.message,
  });

  return error;
};

export const WishlistRepository = {
  /**
   * One shopper's saved pieces, newest first.
   *
   * Joined against `products` rather than selected flat, so that a piece
   * the shop has deactivated stops appearing without anything having to
   * clean the table up. Deactivating is reversible and reactivating
   * should bring the save back; deleting is what removes the row, and
   * the foreign key does that.
   */
  async listByCustomer(customerId) {
    const text = `
      SELECT w.product_id, w.created_at
      FROM wishlist_items w
      JOIN products p ON p.id = w.product_id
      WHERE w.customer_id = $1::uuid
        AND p.active = TRUE
      ORDER BY w.created_at DESC
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
         FROM wishlist_items
         WHERE customer_id = $1::uuid`,
        [customerId],
      );

      return result.rows[0]?.total ?? 0;
    } catch (error) {
      throw handleDatabaseError(error, "countByCustomer", { customerId });
    }
  },

  /**
   * Saves a piece.
   *
   * Returns whether a row was actually inserted, which the service uses
   * only for the log — the API's answer to "save this" is the same
   * either way, because from the shopper's side it already was saved.
   */
  async add(customerId, productId) {
    const text = `
      INSERT INTO wishlist_items (customer_id, product_id)
      VALUES ($1::uuid, $2::uuid)
      ON CONFLICT (customer_id, product_id) DO NOTHING
      RETURNING id
    `;

    try {
      const result = await query(text, [customerId, productId]);
      return result.rowCount > 0;
    } catch (error) {
      throw handleDatabaseError(error, "add", { customerId, productId });
    }
  },

  async remove(customerId, productId) {
    try {
      const result = await query(
        `DELETE FROM wishlist_items
         WHERE customer_id = $1::uuid AND product_id = $2::uuid`,
        [customerId, productId],
      );

      return result.rowCount > 0;
    } catch (error) {
      throw handleDatabaseError(error, "remove", { customerId, productId });
    }
  },

  /**
   * Adds several at once — what sign-in does with whatever the browser
   * had saved while the shopper was a guest.
   *
   * One statement rather than a loop of inserts. `unnest` expands the
   * array into rows, and the same ON CONFLICT makes the whole merge
   * idempotent: signing in on the same laptop twice adds nothing the
   * second time.
   *
   * The join against `products` is what stops a hand-edited localStorage
   * value from putting ids into this table that no product answers to —
   * a foreign key would refuse them one at a time and abort the merge;
   * this quietly drops them and saves the rest, which is the right
   * outcome when the input is whatever was in a browser six months ago.
   */
  async addMany(customerId, productIds) {
    if (!productIds.length) return 0;

    const text = `
      INSERT INTO wishlist_items (customer_id, product_id)
      SELECT $1::uuid, p.id
      FROM unnest($2::uuid[]) AS incoming(id)
      JOIN products p ON p.id = incoming.id AND p.active = TRUE
      ON CONFLICT (customer_id, product_id) DO NOTHING
    `;

    try {
      const result = await query(text, [customerId, productIds]);

      logger.info("Wishlist merged", {
        customerId,
        offered: productIds.length,
        added: result.rowCount,
      });

      return result.rowCount;
    } catch (error) {
      throw handleDatabaseError(error, "addMany", {
        customerId,
        count: productIds.length,
      });
    }
  },
};
