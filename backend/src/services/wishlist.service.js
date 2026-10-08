// src/services/wishlist.service.js
//
// Saved pieces (F-07).
//
// Every method takes a customer id that came from a token and never from
// a request body. There is no "whose wishlist" parameter anywhere in
// this feature, which is what makes it impossible to read or edit
// somebody else's by asking nicely.

import { WishlistRepository } from "../repository/wishlist.repository.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const assertUuid = (value, label) => {
  const id = String(value ?? "").trim();

  if (!UUID_RE.test(id)) {
    throw ApiError.badRequest(`Invalid ${label}`, "INVALID_UUID");
  }

  return id;
};

/**
 * The most pieces one shopper may save.
 *
 * A wishlist is a shortlist. Two hundred is far past what anyone
 * shortlists out of a catalogue this size, and well short of anything
 * that would make the table or the merge query worth worrying about.
 * Its real job is to stop a scripted "save everything" from turning a
 * per-shopper table into a copy of the catalogue.
 */
const MAX_WISHLIST_SIZE = 200;

export const WishlistService = {
  /**
   * The shopper's saved product ids, newest first.
   *
   * Ids, not products. The storefront renders these against the
   * catalogue it already holds, so a saved piece shows the same price as
   * the same piece on the shop page — necessarily, rather than by both
   * happening to be fresh.
   */
  async getMine(customerId) {
    try {
      const rows = await WishlistRepository.listByCustomer(customerId);

      return rows.map((row) => ({
        productId: row.product_id,
        savedAt: row.created_at,
      }));
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("WishlistService.getMine failed", {
        customerId,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to load your wishlist");
    }
  },

  /**
   * Saves a piece.
   *
   * Succeeds when it was already saved. The caller is a toggle on a
   * card, and reporting "already saved" as a conflict would make the
   * storefront handle an error for something that is not one.
   */
  async add(customerId, productId) {
    const id = assertUuid(productId, "product ID");

    try {
      const count = await WishlistRepository.countByCustomer(customerId);

      if (count >= MAX_WISHLIST_SIZE) {
        throw new ApiError(
          409,
          `A wishlist holds up to ${MAX_WISHLIST_SIZE} pieces. ` +
            `Remove one to save another.`,
        );
      }

      const inserted = await WishlistRepository.add(customerId, id);

      logger.info("Wishlist item saved", {
        customerId,
        productId: id,
        alreadySaved: !inserted,
      });

      return WishlistService.getMine(customerId);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      // 23503: the product id is well-formed but nothing answers to it.
      // A 404 rather than a 500 — it is the caller's id that is wrong.
      if (error?.code === "23503") {
        throw ApiError.notFound("Product not found", "PRODUCT_NOT_FOUND");
      }

      logger.error("WishlistService.add failed", {
        customerId,
        productId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to save the piece");
    }
  },

  /** Removes a piece. Succeeds when it was not saved, for the same reason. */
  async remove(customerId, productId) {
    const id = assertUuid(productId, "product ID");

    try {
      await WishlistRepository.remove(customerId, id);

      return WishlistService.getMine(customerId);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("WishlistService.remove failed", {
        customerId,
        productId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to remove the piece");
    }
  },

  /**
   * Folds a guest's browser-side wishlist into their account (F-07).
   *
   * Called once, immediately after signing in or registering. The
   * shopper saved three pieces before they had an account; those pieces
   * are theirs, and losing them at the moment they sign up is the worst
   * possible time to lose them.
   *
   * A merge, never a replace. The account's existing saves stay — the
   * shopper may have a list on their phone already, and this laptop's
   * three pieces are an addition to it, not a correction of it.
   *
   * Ids that do not resolve to an active product are dropped rather than
   * failing the call: the input is whatever a browser was holding, which
   * may name pieces sold out and deleted months ago.
   */
  async merge(customerId, productIds) {
    const ids = [...new Set((productIds ?? []).map((value) => String(value ?? "").trim()))]
      .filter((value) => UUID_RE.test(value))
      .slice(0, MAX_WISHLIST_SIZE);

    try {
      if (ids.length) {
        await WishlistRepository.addMany(customerId, ids);
      }

      return WishlistService.getMine(customerId);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("WishlistService.merge failed", {
        customerId,
        offered: ids.length,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to merge your saved pieces");
    }
  },
};
