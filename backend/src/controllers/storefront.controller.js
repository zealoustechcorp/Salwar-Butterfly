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
   * GET /api/storefront/getSizeCharts
   *
   * The charts the shop publishes, in the order it prints them.
   *
   * Cached for longer than the catalogue is, and for the same reason the
   * reviews are: stock is what makes the catalogue stale in a minute,
   * while a size chart changes when the shop reprints a card — a few
   * times a year. Five minutes in front of it keeps the chart dialog
   * free on every page that can open it.
   */
  getSizeCharts: asyncHandler(async (req, res) => {
    const charts = await StorefrontService.getSizeCharts();

    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");

    return okResponse({
      res,
      data: charts,
      message: "Size charts fetched successfully",
      meta: { counts: { charts: charts.charts.length } },
    });
  }),

  /**
   * GET /api/storefront/getBanners
   *
   * The slides the home page carousel is showing, in rotation order.
   *
   * Cached on the size charts' terms rather than the catalogue's. Stock
   * is what makes the catalogue stale in a minute; a banner set changes
   * when the shop changes its artwork — a few times a season — and five
   * minutes in front of it keeps the first fold of the home page free to
   * serve.
   */
  getBanners: asyncHandler(async (req, res) => {
    const banners = await StorefrontService.getBanners();

    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");

    return okResponse({
      res,
      data: banners,
      message: "Banners fetched successfully",
      meta: { counts: { banners: banners.banners.length } },
    });
  }),

  /**
   * GET /api/storefront/getCustomerStories
   *
   * What customers have sent the shop, as the home page prints it.
   *
   * Cached on the banners' terms. A story is published once and does not
   * change afterwards, so five minutes in front of it costs nothing a
   * visitor would notice.
   */
  getCustomerStories: asyncHandler(async (req, res) => {
    const stories = await StorefrontService.getCustomerStories();

    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");

    return okResponse({
      res,
      data: stories,
      message: "Customer stories fetched successfully",
      meta: { counts: { stories: stories.stories.length } },
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
