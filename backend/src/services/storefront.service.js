// src/services/storefront.service.js
//
// The public catalogue (F-06 Product Browsing & Search).
//
// This service answers one question — "what is on the shelf?" — and it
// answers it for everybody, with no token. Two decisions are worth
// stating up front, because both look like shortcuts and neither is.
//
// It serves the whole catalogue in one response rather than a paginated
// list. The shop holds ~200 pieces, and the storefront filters by
// collection, fabric, size and search term entirely on the client so that
// browsing costs nothing. Paginating would trade an instant grid for a
// spinner on every filter change, to save a payload that gzips to well
// under what one product photo weighs. When the catalogue outgrows that,
// this is the file that changes, and `getCatalogue` is the only caller.
//
// It caches in process for a few seconds. See CACHE_TTL_MS below.

import { StorefrontRepository } from "../repository/storefront.repository.js";
import { StorefrontMapper } from "../mapper/storefront.mapper.js";
import { SizeChartMapper } from "../mapper/size_chart.mapper.js";
import { BannerMapper } from "../mapper/banner.mapper.js";
import { CustomerStoryMapper } from "../mapper/customer_story.mapper.js";
import { MAX_STORIES_ON_HOME } from "../config/customer_story.policy.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

// ============================================================
// CACHE
// ============================================================
//
// The storefront is the one endpoint an anonymous crawler can hit as
// fast as it likes, and each miss runs two queries with LATERALs over
// every active product. Ten seconds of memo turns a burst into one
// query without putting anything stale in front of a shopper: the
// frontend already revalidates its own copy on a longer interval, so
// this window is invisible next to it.
//
// Deliberately not invalidated by admin writes. A cache that must be
// poked from twelve other services is a cache that will be missed from
// the thirteenth; a short TTL is correct without anyone remembering it.

const CACHE_TTL_MS = 10_000;

/**
 * The most reviews one product page is served.
 *
 * A boutique piece collects a handful, not a thread. The count comes
 * back alongside, so a page can say "showing 50 of 63" rather than
 * quietly truncating — but in practice this cap is not expected to bind.
 */
const MAX_REVIEWS = 50;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let cache = null;

/**
 * The size charts, memoed on the same terms.
 *
 * Its own entry rather than a field on the catalogue's, because the two
 * are fetched by different endpoints: a page that only opens the chart
 * dialog should not pull two hundred products to do it.
 */
let chartsCache = null;

/**
 * The carousel, memoed on the same terms as the charts.
 *
 * Its own entry for the same reason: the home page is the only thing
 * that asks for the banners, and folding them into the catalogue would
 * make every product page carry a list it never renders.
 */
let bannersCache = null;

/** The customer stories, memoed on the same terms as the banners. */
let storiesCache = null;

const readCache = () => {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  return null;
};

/** Dropped on demand by tests, and by nothing else. */
export const clearStorefrontCache = () => {
  cache = null;
  chartsCache = null;
  bannersCache = null;
  storiesCache = null;
};

// ============================================================
// SERVICE
// ============================================================

export const StorefrontService = {
  /**
   * Everything the storefront renders from.
   *
   * `fetched_at` is when this was read out of the database, not when the
   * catalogue last changed. The storefront shows it as a freshness
   * marker, and it is the honest value for that: it is the age of the
   * data in the reader's hands.
   */
  async getCatalogue() {
    const cached = readCache();
    if (cached) return cached;

    try {
      const [categoryRows, productRows] = await Promise.all([
        StorefrontRepository.categories(),
        StorefrontRepository.products(),
      ]);

      // A product with no photo cannot be rendered as a card — the grid
      // is photography first. Dropped here rather than shipped as a grey
      // box for the frontend to discover and hide.
      const shippable = productRows.filter((row) => Boolean(row.image));

      const countByCategory = new Map();

      for (const row of shippable) {
        countByCategory.set(
          row.category_id,
          (countByCategory.get(row.category_id) ?? 0) + 1,
        );
      }

      // How the shop scores overall (F-06.08) — what the hero shows.
      //
      // Added up from the rows above rather than asked for separately,
      // which makes it exactly consistent with what the page renders: a
      // review on a product that was dropped for having no photo cannot
      // appear in a figure printed over a grid that does not contain it.
      //
      // Weighted by review, not by product. The star totals are summed
      // and divided by the number of reviews, so a piece with twenty
      // reviews counts twenty times — averaging the per-product averages
      // would let one five-star review outweigh them.
      const stars = shippable.reduce(
        (running, row) => ({
          count: running.count + (Number(row.rating_count) || 0),
          sum: running.sum + (Number(row.rating_sum) || 0),
          products: running.products + (Number(row.rating_count) > 0 ? 1 : 0),
        }),
        { count: 0, sum: 0, products: 0 },
      );

      const catalogue = {
        fetched_at: new Date().toISOString(),

        // `average` is null, never 0, when nothing has been published —
        // zero is a rating, and the hero must be able to tell "no
        // reviews yet" from "everybody hated it". It renders nothing at
        // all in the first case.
        rating: {
          count: stars.count,
          products: stars.products,
          average: stars.count
            ? Number((stars.sum / stars.count).toFixed(1))
            : null,
        },

        // Only categories that have something to show. An empty
        // collection tile is a dead end with a photo on it.
        categories: categoryRows
          .filter((row) => countByCategory.get(row.id) > 0)
          .map((row) => StorefrontMapper.toCategory(row, countByCategory.get(row.id)))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),

        products: shippable.map((row) => StorefrontMapper.toProduct(row)),
      };

      const skipped = productRows.length - shippable.length;

      if (skipped > 0) {
        logger.warn("Storefront catalogue: products skipped for having no photo", {
          skipped,
        });
      }

      cache = { at: Date.now(), value: catalogue };

      return catalogue;
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("StorefrontService.getCatalogue failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to load the catalogue");
    }
  },

  /**
   * The size charts the shop publishes (F-06).
   *
   * Its own request rather than part of the catalogue, and for the
   * opposite reason to the reviews below: the reviews are per product
   * and would bloat a shared document, while the charts are one small
   * document shared by every page — including the bag and the account
   * page, which have no catalogue to ride along on.
   *
   * An empty list is a real answer, not a failure. It means the shop has
   * taken every chart down, and the storefront renders no size-chart
   * button rather than falling back to numbers of its own.
   */
  async getSizeCharts() {
    if (chartsCache && Date.now() - chartsCache.at < CACHE_TTL_MS) {
      return chartsCache.value;
    }

    try {
      const rows = await StorefrontRepository.sizeCharts();

      const charts = {
        fetched_at: new Date().toISOString(),
        charts: SizeChartMapper.toPublicList(rows),
      };

      chartsCache = { at: Date.now(), value: charts };

      return charts;
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("StorefrontService.getSizeCharts failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to load the size charts");
    }
  },

  /**
   * The slides the home page carousel is showing (F-06).
   *
   * Its own request rather than part of the catalogue, on the same
   * terms as the size charts: this is one small document, and the
   * catalogue is a large one that every page of the storefront loads.
   * Only the home page renders these.
   *
   * An empty list is a real answer and not a failure. It means the shop
   * has taken every banner down, and Hero.js falls back to its
   * illustrated lockup — which is what it already did whenever the
   * photographs failed to load, so there is no new case to handle.
   */
  async getBanners() {
    if (bannersCache && Date.now() - bannersCache.at < CACHE_TTL_MS) {
      return bannersCache.value;
    }

    try {
      const rows = await StorefrontRepository.banners();

      const banners = {
        fetched_at: new Date().toISOString(),
        banners: BannerMapper.toPublicList(rows),
      };

      bannersCache = { at: Date.now(), value: banners };

      return banners;
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("StorefrontService.getBanners failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to load the banners");
    }
  },

  /**
   * What customers have sent the shop (F-06.08), for the home page.
   *
   * Its own request rather than part of the catalogue, on the same terms
   * as the banners: only the home page renders these, and folding them
   * into the document every page loads would make a product page carry a
   * rail it never draws.
   *
   * Capped at MAX_STORIES_ON_HOME rather than paginated. There is no
   * "load more" on a section like this, and the cap is applied in the
   * shop's own order — the first two dozen are the two dozen the shop
   * put first.
   *
   * An empty list is a real answer and not a failure: it means the shop
   * has published none, and the section is not rendered at all rather
   * than appearing as a heading over nothing.
   */
  async getCustomerStories() {
    if (storiesCache && Date.now() - storiesCache.at < CACHE_TTL_MS) {
      return storiesCache.value;
    }

    try {
      const rows = await StorefrontRepository.customerStories(
        MAX_STORIES_ON_HOME,
      );

      const stories = {
        fetched_at: new Date().toISOString(),
        stories: CustomerStoryMapper.toPublicList(rows),
      };

      storiesCache = { at: Date.now(), value: stories };

      return stories;
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("StorefrontService.getCustomerStories failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to load the customer stories");
    }
  },

  /**
   * What shoppers have said about one piece (F-06.08).
   *
   * Its own request rather than part of the catalogue, and that is the
   * one design decision here worth defending. The catalogue is a single
   * document covering ~200 products that every page of the storefront
   * loads; folding each piece's reviews into it would grow the payload
   * for every visitor to serve a section only the few who open a
   * product page will read. The average and the count *are* in the
   * catalogue, because a card shows stars — that is two numbers per
   * product, not a paragraph.
   *
   * Not cached. It is read once per product page render, behind Next's
   * own revalidation, and a review published by the shop should appear
   * without waiting on a second cache underneath that one.
   *
   * A product that does not exist, or has been taken off sale, is a 404
   * — not an empty list. An empty list is a real and different answer:
   * a piece nobody has reviewed yet.
   */
  async getProductReviews(productId) {
    const id = String(productId ?? "").trim();

    if (!id || !UUID_REGEX.test(id)) {
      throw new ApiError(400, "Invalid product ID");
    }

    try {
      const visible = await StorefrontRepository.productIsVisible(id);

      if (!visible) {
        throw new ApiError(404, "That piece is not in the shop");
      }

      const [ratingRow, reviewRows] = await Promise.all([
        StorefrontRepository.productRating(id),
        StorefrontRepository.reviewsFor(id, MAX_REVIEWS),
      ]);

      return {
        product_id: id,
        rating: StorefrontMapper.toRating(ratingRow),
        reviews: reviewRows.map((row) => StorefrontMapper.toReview(row)),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("StorefrontService.getProductReviews failed", {
        productId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to load reviews for this piece");
    }
  },
};
