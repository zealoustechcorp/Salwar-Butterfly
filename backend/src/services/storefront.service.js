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

let cache = null;

const readCache = () => {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  return null;
};

/** Dropped on demand by tests, and by nothing else. */
export const clearStorefrontCache = () => {
  cache = null;
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

      const catalogue = {
        fetched_at: new Date().toISOString(),

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
};
