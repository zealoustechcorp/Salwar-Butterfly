// src/controllers/inventory.controller.js

import { InventoryService } from "../services/inventory.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import { okResponse, successResponse } from "../utils/apiResponse.js";

export const InventoryController = {
  getInventory: asyncHandler(async (req, res) => {
    try {
      const {
        status,
        search,
        categoryId,
        productId,
        activeOnly,
        sort,
        page = 1,
        limit = 50,
      } = req.query;

      logger.info("Get inventory endpoint called", { status, sort, page });

      const result = await InventoryService.getInventory({
        status,
        search,
        categoryId,
        productId,
        activeOnly,
        sort,
        page,
        limit,
      });

      return successResponse({
        res,
        data: result.data,
        meta: {
          pagination: result.pagination,
          summary: result.summary,
        },
        message: "Inventory retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get inventory endpoint error", { error: error?.message });
      throw new ApiError(500, "Failed to fetch inventory");
    }
  }),

  getSummary: asyncHandler(async (req, res) => {
    try {
      const { categoryId, activeOnly } = req.query;

      logger.info("Get inventory summary endpoint called", { categoryId });

      const summary = await InventoryService.getSummary({
        categoryId,
        activeOnly,
      });

      return okResponse({
        res,
        data: summary,
        message: "Inventory summary retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get inventory summary endpoint error", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch inventory summary");
    }
  }),

  adjustStock: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const { delta } = req.body;

      logger.info("Adjust stock endpoint called", { variantId: id, delta });

      const line = await InventoryService.adjustStock(id, delta);

      return okResponse({
        res,
        data: line,
        message:
          Number(delta) > 0
            ? `Added ${delta} to ${line.product.name} (${line.size})`
            : `Removed ${Math.abs(Number(delta))} from ${line.product.name} (${line.size})`,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Adjust stock endpoint error", {
        variantId: req.params?.id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to adjust stock");
    }
  }),

  setStock: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const { stockQuantity, expectedStockQuantity } = req.body;

      logger.info("Set stock endpoint called", {
        variantId: id,
        stockQuantity,
      });

      const line = await InventoryService.setStock(
        id,
        stockQuantity,
        expectedStockQuantity,
      );

      return okResponse({
        res,
        data: line,
        message: `${line.product.name} (${line.size}) set to ${line.stockQuantity}`,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Set stock endpoint error", {
        variantId: req.params?.id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update stock");
    }
  }),

  bulkAdjustStock: asyncHandler(async (req, res) => {
    try {
      const { adjustments } = req.body;

      logger.info("Bulk adjust stock endpoint called", {
        count: adjustments?.length,
      });

      const lines = await InventoryService.bulkAdjustStock(adjustments);

      return okResponse({
        res,
        data: lines,
        message: `${lines.length} size${lines.length === 1 ? "" : "s"} updated successfully`,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Bulk adjust stock endpoint error", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to apply stock adjustments");
    }
  }),
};
