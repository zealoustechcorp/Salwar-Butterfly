// src/controllers/wishlist.controller.js
//
// Saved pieces (F-07).
//
// Every method reads the customer id off the token and passes it down.
// There is no path through this controller by which one shopper can name
// another, which is the whole of this feature's authorization.
//
// All four return the complete list rather than just the piece that
// changed. A wishlist is small, it is a toggle the shopper will hit
// again in a moment, and a client that has to apply a delta locally is a
// client whose heart icons can drift out of step with the server.

import { WishlistService } from "../services/wishlist.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { okResponse } from "../utils/apiResponse.js";
import { logger } from "../utils/logger.js";

const list = (res, items, message) =>
  okResponse({
    res,
    data: items,
    message,
    meta: { count: items.length },
  });

export const WishlistController = {
  /** GET /api/wishlist/getMyWishlist */
  getMine: asyncHandler(async (req, res) => {
    const items = await WishlistService.getMine(req.user.id);

    return list(res, items, "Wishlist fetched successfully");
  }),

  /** POST /api/wishlist/addItem */
  add: asyncHandler(async (req, res) => {
    const { productId } = req.body;

    const items = await WishlistService.add(req.user.id, productId);

    return list(res, items, "Piece saved successfully");
  }),

  /** DELETE /api/wishlist/removeItem/:productId */
  remove: asyncHandler(async (req, res) => {
    const { productId } = req.params;

    const items = await WishlistService.remove(req.user.id, productId);

    return list(res, items, "Piece removed successfully");
  }),

  /**
   * POST /api/wishlist/mergeWishlist
   *
   * What the storefront calls the moment a guest signs in, carrying
   * whatever they had saved in the browser.
   */
  merge: asyncHandler(async (req, res) => {
    const { productIds } = req.body;

    logger.info("Wishlist merge endpoint called", {
      customerId: req.user.id,
      offered: productIds.length,
    });

    const items = await WishlistService.merge(req.user.id, productIds);

    return list(res, items, "Wishlist merged successfully");
  }),
};
