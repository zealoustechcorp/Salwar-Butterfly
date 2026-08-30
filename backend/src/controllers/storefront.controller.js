// src/controllers/storefront.controller.js
//
// The public catalogue (F-06).

import { StorefrontService } from "../services/storefront.service.js";
import { okResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const StorefrontController = {
  /**
   * GET /api/storefront/getCatalogue
   *
   * The whole shelf, in the shape the storefront renders from.
   *
   * A `Cache-Control` header rather than silence: this is a public,
   * anonymous, unchanging-for-seconds document, and every layer between
   * here and the shopper — Next's data cache, a CDN, the browser — can
   * hold it. `stale-while-revalidate` is the important half. It means a
   * cache that has aged past sixty seconds serves what it has and
   * refreshes behind the request, so a shopper never waits on this
   * query even at the moment it expires.
   */
  getCatalogue: asyncHandler(async (req, res) => {
    const catalogue = await StorefrontService.getCatalogue();

    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

    return okResponse({
      res,
      data: catalogue,
      message: "Catalogue fetched successfully",
      meta: {
        counts: {
          categories: catalogue.categories.length,
          products: catalogue.products.length,
        },
      },
    });
  }),

  /**
   * GET /api/storefront/getProductReviews/:id
   *
   * Published reviews for one piece (F-06.08), with the average and the
   * spread the star bar draws.
   *
   * Cached for longer than the catalogue is. Stock is what makes the
   * catalogue go stale in a minute; a review is written once and never
   * changes, so five minutes in front of it costs nothing a shopper
   * would notice and keeps the product page cheap to serve.
   */
  getProductReviews: asyncHandler(async (req, res) => {
    const reviews = await StorefrontService.getProductReviews(req.params.id);

    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");

    return okResponse({
      res,
      data: reviews,
      message: "Reviews fetched successfully",
      meta: {
        counts: {
          returned: reviews.reviews.length,
          total: reviews.rating.count,
        },
      },
    });
  }),
};
