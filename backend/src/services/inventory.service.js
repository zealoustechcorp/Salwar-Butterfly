// src/services/inventory.service.js

import {
  DEFAULT_SORT,
  InventoryRepository,
} from "../repository/inventory.repository.js";
import { InventoryMapper } from "../mapper/inventory.mapper.js";
import { MAX_STOCK, STOCK_STATUSES } from "../config/stock.policy.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SORTS = new Set(["stock_asc", "stock_desc", "product", "updated"]);

/**
 * How many lines one bulk adjustment may carry. A delivery is a handful
 * of sizes; a request with thousands is a mistake, and it would hold a
 * transaction open long enough to matter.
 */
const MAX_BULK_ADJUSTMENTS = 200;

const assertUuid = (value, label) => {
  const normalized = String(value ?? "").trim();
  if (!normalized || !UUID_REGEX.test(normalized)) {
    throw new ApiError(400, `Invalid ${label}`);
  }
  return normalized;
};

const normalizeQuantity = (value, label = "Stock") => {
  if (value === undefined || value === null || value === "") {
    throw new ApiError(400, `${label} is required`);
  }

  const quantity = Number(value);

  if (!Number.isInteger(quantity)) {
    throw new ApiError(400, `${label} must be a whole number`);
  }

  if (quantity < 0) {
    throw new ApiError(400, `${label} cannot be negative`);
  }

  if (quantity > MAX_STOCK) {
    throw new ApiError(
      400,
      `${label} exceeds the maximum of ${MAX_STOCK.toLocaleString("en-IN")}`,
    );
  }

  return quantity;
};

/**
 * A movement, which unlike a quantity may be negative — that is the
 * point of it — but may not be zero: a request that changes nothing is
 * a bug in the caller, not a no-op worth pretending to apply.
 */
const normalizeDelta = (value, label = "Adjustment") => {
  if (value === undefined || value === null || value === "") {
    throw new ApiError(400, `${label} is required`);
  }

  const delta = Number(value);

  if (!Number.isInteger(delta)) {
    throw new ApiError(400, `${label} must be a whole number`);
  }

  if (delta === 0) {
    throw new ApiError(400, `${label} cannot be zero`);
  }

  if (Math.abs(delta) > MAX_STOCK) {
    throw new ApiError(
      400,
      `${label} exceeds the maximum of ${MAX_STOCK.toLocaleString("en-IN")}`,
    );
  }

  return delta;
};

const normalizeSearch = (value) => {
  const search = String(value ?? "").trim();
  if (!search) return null;
  return search.slice(0, 100);
};

/**
 * Turns a repository miss into the reason it missed.
 *
 * The guarded UPDATE returns no row for three different reasons and the
 * admin needs to be told which: a stale link, a delta that would go
 * below zero, or one that would go through the ceiling.
 */
const explainFailedWrite = async (variantId, delta = null) => {
  const current = await InventoryRepository.findById(variantId);

  if (!current) {
    throw new ApiError(404, "This size no longer exists");
  }

  if (delta === null) {
    throw new ApiError(
      409,
      "That stock count changed while this screen was open. Reload and try again.",
    );
  }

  const held = Number(current.stock_quantity);

  if (held + delta < 0) {
    throw new ApiError(
      409,
      `Only ${held} in stock — that would take ${current.product_name} (${current.size}) below zero.`,
    );
  }

  throw new ApiError(
    400,
    `That would take stock above the maximum of ${MAX_STOCK.toLocaleString("en-IN")}.`,
  );
};

export const InventoryService = {
  /**
   * A page of inventory lines, plus the catalogue-wide totals the tiles
   * show.
   *
   * The totals are fetched alongside rather than derived from the page:
   * a page is fifty rows and the tiles describe every row there is.
   */
  async getInventory({
    status = null,
    search = null,
    categoryId = null,
    productId = null,
    activeOnly = false,
    sort = DEFAULT_SORT,
    page = 1,
    limit = 50,
  } = {}) {
    try {
      if (status && !STOCK_STATUSES.includes(status)) {
        throw new ApiError(
          400,
          `Unknown stock status "${status}". Expected one of: ${STOCK_STATUSES.join(", ")}.`,
        );
      }

      if (sort && !SORTS.has(sort)) {
        throw new ApiError(
          400,
          `Unknown sort "${sort}". Expected one of: ${[...SORTS].join(", ")}.`,
        );
      }

      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

      const filters = {
        status: status || null,
        search: normalizeSearch(search),
        categoryId: categoryId ? assertUuid(categoryId, "category ID") : null,
        productId: productId ? assertUuid(productId, "product ID") : null,
        activeOnly: activeOnly === true || activeOnly === "true",
        sort: sort || DEFAULT_SORT,
        page: safePage,
        limit: safeLimit,
      };

      const [result, summaryRows] = await Promise.all([
        InventoryRepository.findAll(filters),
        InventoryRepository.summary({
          categoryId: filters.categoryId,
          activeOnly: filters.activeOnly,
        }),
      ]);

      const totalPages =
        result.total === 0 ? 0 : Math.ceil(result.total / safeLimit);

      logger.info("Inventory fetched", {
        status: filters.status,
        returned: result.rows.length,
        total: result.total,
      });

      return {
        data: InventoryMapper.toDTOList(result.rows),
        summary: InventoryMapper.toSummary(summaryRows),
        pagination: {
          page: safePage,
          limit: safeLimit,
          total: result.total,
          totalPages,
          hasNextPage: safePage < totalPages,
          hasPreviousPage: safePage > 1,
        },
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("InventoryService.getInventory failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch inventory");
    }
  },

  /** The totals on their own — for the dashboard, which shows no table. */
  async getSummary({ categoryId = null, activeOnly = false } = {}) {
    try {
      const rows = await InventoryRepository.summary({
        categoryId: categoryId ? assertUuid(categoryId, "category ID") : null,
        activeOnly: activeOnly === true || activeOnly === "true",
      });

      return InventoryMapper.toSummary(rows);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("InventoryService.getSummary failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch inventory summary");
    }
  },

  /**
   * Moves one size's stock by a delta — "two more arrived", "one was
   * damaged".
   *
   * A delta rather than a new total, because that is what actually
   * happened, and because it survives two people doing it at once: two
   * +1s land as +2, where two saves of "3" land as 3.
   */
  async adjustStock(variantId, delta) {
    try {
      const id = assertUuid(variantId, "variant ID");
      const movement = normalizeDelta(delta);

      const row = await InventoryRepository.adjustStock(id, movement);

      // Nothing updated: say which of the three reasons it was.
      if (!row) await explainFailedWrite(id, movement);

      const updated = await InventoryRepository.findById(id);

      logger.info("Stock adjusted", {
        variantId: id,
        delta: movement,
        stockQuantity: row.stock_quantity,
      });

      return InventoryMapper.toDTO(updated);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      if (error?.code === "STOCK_NEGATIVE") {
        throw new ApiError(409, "Stock cannot go below zero");
      }

      logger.error("InventoryService.adjustStock failed", {
        variantId,
        delta,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to adjust stock");
    }
  },

  /**
   * Sets one size's stock to a counted figure — a stock-take.
   *
   * `expectedStockQuantity` is what the screen was showing when the
   * admin started typing. Passing it makes the write conditional, so a
   * correction based on a stale page is refused rather than quietly
   * undoing whatever changed in the meantime.
   */
  async setStock(variantId, stockQuantity, expectedStockQuantity = null) {
    try {
      const id = assertUuid(variantId, "variant ID");
      const quantity = normalizeQuantity(stockQuantity);

      const expected =
        expectedStockQuantity === undefined || expectedStockQuantity === null
          ? null
          : normalizeQuantity(expectedStockQuantity, "Expected stock");

      const row = await InventoryRepository.setStock(id, quantity, expected);

      if (!row) await explainFailedWrite(id, null);

      const updated = await InventoryRepository.findById(id);

      logger.info("Stock set", { variantId: id, stockQuantity: quantity });

      return InventoryMapper.toDTO(updated);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      if (error?.code === "STOCK_NEGATIVE") {
        throw new ApiError(400, "Stock cannot be negative");
      }

      logger.error("InventoryService.setStock failed", {
        variantId,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update stock");
    }
  },

  /**
   * Several movements as one transaction — receiving a delivery.
   *
   * All or nothing. A half-applied delivery is worse than a rejected
   * one: the admin cannot tell by looking which half landed, so the only
   * safe response is to re-count everything.
   */
  async bulkAdjustStock(adjustments) {
    try {
      if (!Array.isArray(adjustments) || adjustments.length === 0) {
        throw new ApiError(400, "At least one adjustment is required");
      }

      if (adjustments.length > MAX_BULK_ADJUSTMENTS) {
        throw new ApiError(
          400,
          `At most ${MAX_BULK_ADJUSTMENTS} adjustments can be applied at once`,
        );
      }

      const seen = new Set();

      const normalized = adjustments.map((adjustment, index) => {
        const label = `Adjustment at index ${index}`;
        const id = assertUuid(adjustment?.variantId, `${label}: variant ID`);

        // Two movements for one size in a single batch would both apply
        // and the caller would see only the second reflected back.
        if (seen.has(id)) {
          throw new ApiError(400, `${label}: this size is listed more than once`);
        }
        seen.add(id);

        return { variantId: id, delta: normalizeDelta(adjustment?.delta, label) };
      });

      const rows = await InventoryRepository.bulkAdjustStock(normalized);

      logger.info("Bulk stock adjustment applied", { count: rows.length });

      // Re-read through the join so the response carries the same shape
      // the table renders, rather than bare variant rows. Returned in
      // the order they were sent, which is the order the screen listed
      // them in.
      const updated = await InventoryRepository.findByIds(
        normalized.map((adjustment) => adjustment.variantId),
      );

      const byId = new Map(updated.map((row) => [row.id, row]));

      return normalized
        .map(({ variantId }) => byId.get(variantId))
        .filter(Boolean)
        .map((row) => InventoryMapper.toDTO(row));
    } catch (error) {
      if (error instanceof ApiError) throw error;

      if (error?.code === "VARIANT_NOT_FOUND") {
        throw new ApiError(404, "One of those sizes no longer exists");
      }

      if (error?.code === "STOCK_NEGATIVE") {
        throw new ApiError(
          409,
          `Only ${error.available} in stock — an adjustment of ${error.delta} would take it below zero. Nothing was changed.`,
        );
      }

      if (error?.code === "STOCK_CEILING") {
        throw new ApiError(
          400,
          `That would take stock above the maximum of ${MAX_STOCK.toLocaleString("en-IN")}. Nothing was changed.`,
        );
      }

      logger.error("InventoryService.bulkAdjustStock failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to apply stock adjustments");
    }
  },
};
