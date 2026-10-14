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

import { query, withTransaction } from "../config/db.js";
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

/**
 * Why a save was refused, carried out of the transaction as a tagged
 * error so it rolls back and the service can name the outcome.
 */
export const WISHLIST_RULE = Object.freeze({
  LIMIT_REACHED: "LIMIT_REACHED",
  PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
  PRODUCT_UNAVAILABLE: "PRODUCT_UNAVAILABLE",
  ACCOUNT_CLOSED: "ACCOUNT_CLOSED",
});

const ruleError = (rule) =>
  Object.assign(new Error(`WISHLIST_${rule}`), { wishlistRule: rule });

/**
 * Serialise one shopper's saves and refuse a closed account.
 *
 * The same lock customer_address.repository.js takes, for the same two
 * reasons: the size cap was check-then-insert across two connections, so
 * a burst of concurrent saves could all count 199 and all insert (BUG-5);
 * and a closed account's access token stays valid for up to fifteen
 * minutes, which this read refuses at no extra round trip (BUG-7).
 * FOR NO KEY UPDATE so foreign-key checks elsewhere are not blocked.
 */
const lockOwner = async (client, customerId) => {
  const { rowCount } = await client.query(
    `SELECT 1
     FROM customers
     WHERE id = $1::uuid AND deleted_at IS NULL
     FOR NO KEY UPDATE`,
    [customerId],
  );

  if (rowCount === 0) throw ruleError(WISHLIST_RULE.ACCOUNT_CLOSED);
};

const countSaved = async (client, customerId) => {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM wishlist_items
     WHERE customer_id = $1::uuid`,
    [customerId],
  );

  return rows[0]?.total ?? 0;
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
   *
   * Only an active product may be saved — the same rule `addMany` has
   * always applied through its join (BUG-8). A save of a deactivated
   * piece would sit in the table invisible, since `listByCustomer`
   * hides it, while still counting towards the cap.
   *
   * Order of checks: an already-saved piece succeeds even at the cap
   * (a double-tapped heart is not a new save), and the cap is counted
   * under the owner lock so it holds under concurrency.
   *
   * @throws tagged WISHLIST_RULE errors
   */
  async add(customerId, productId, { maxItems }) {
    return withTransaction(async (client) => {
      await lockOwner(client, customerId);

      const product = await client.query(
        `SELECT active FROM products WHERE id = $1::uuid`,
        [productId],
      );

      if (product.rowCount === 0) throw ruleError(WISHLIST_RULE.PRODUCT_NOT_FOUND);
      if (!product.rows[0].active) throw ruleError(WISHLIST_RULE.PRODUCT_UNAVAILABLE);

      const saved = await client.query(
        `SELECT 1 FROM wishlist_items
         WHERE customer_id = $1::uuid AND product_id = $2::uuid`,
        [customerId, productId],
      );

      if (saved.rowCount > 0) return false;

      if ((await countSaved(client, customerId)) >= maxItems) {
        throw ruleError(WISHLIST_RULE.LIMIT_REACHED);
      }

      const result = await client.query(
        `INSERT INTO wishlist_items (customer_id, product_id)
         VALUES ($1::uuid, $2::uuid)
         ON CONFLICT (customer_id, product_id) DO NOTHING
         RETURNING id`,
        [customerId, productId],
      );

      return result.rowCount > 0;
    }).catch((error) => {
      if (error?.wishlistRule) throw error;

      throw handleDatabaseError(error, "add", { customerId, productId });
    });
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
   *
   * The cap counts what the account already holds (BUG-8): only
   * `maxItems - saved` new pieces are taken, in the order the browser
   * offered them, and the rest are dropped like any other unusable id.
   * Counted under the owner lock, so a merge racing a save cannot
   * overshoot either.
   */
  async addMany(customerId, productIds, { maxItems }) {
    if (!productIds.length) return 0;

    const text = `
      INSERT INTO wishlist_items (customer_id, product_id)
      SELECT $1::uuid, p.id
      FROM unnest($2::uuid[]) WITH ORDINALITY AS incoming(id, ord)
      JOIN products p ON p.id = incoming.id AND p.active = TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM wishlist_items w
        WHERE w.customer_id = $1::uuid AND w.product_id = p.id
      )
      ORDER BY incoming.ord
      LIMIT $3
      ON CONFLICT (customer_id, product_id) DO NOTHING
    `;

    try {
      const result = await withTransaction(async (client) => {
        await lockOwner(client, customerId);

        const room = maxItems - (await countSaved(client, customerId));

        if (room <= 0) return { rowCount: 0 };

        return client.query(text, [customerId, productIds, room]);
      });

      logger.info("Wishlist merged", {
        customerId,
        offered: productIds.length,
        added: result.rowCount,
      });

      return result.rowCount;
    } catch (error) {
      if (error?.wishlistRule) throw error;

      throw handleDatabaseError(error, "addMany", {
        customerId,
        count: productIds.length,
      });
    }
  },
};
