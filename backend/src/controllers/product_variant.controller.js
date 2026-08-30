// src/controllers/product_variant.controller.js

import { ProductVariantService } from "../services/product_variant.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import {
  successResponse,
  createdResponse,
  noContentResponse,
  okResponse,
} from "../utils/apiResponse.js";

export const ProductVariantController = {
  getByProduct: asyncHandler(async (req, res) => {
    try {
      const { productId } = req.params;

      logger.info("Get variants by product endpoint called", { productId });

      const result = await ProductVariantService.getByProductId(productId);

      return successResponse({
        res,
        data: result.data,
        meta: { summary: result.summary },
        message: "Product variants retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get variants by product endpoint error", {
        productId: req.params?.productId,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch product variants");
    }
  }),

  getAll: asyncHandler(async (req, res) => {
    try {
      const { page = 1, limit = 100 } = req.query;

      logger.info("Get all variants endpoint called", { page, limit });

      const result = await ProductVariantService.getAll({ page, limit });

      return successResponse({
        res,
        data: result.data,
        meta: {
          pagination: result.pagination,
          summaries: result.summaries,
        },
        message: "Product variants retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get all variants endpoint error", { error: error?.message });
      throw new ApiError(500, "Failed to fetch product variants");
    }
  }),

  getById: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      logger.info("Get variant by ID endpoint called", { variantId: id });

      const variant = await ProductVariantService.getById(id);

      return okResponse({
        res,
        data: variant,
        message: "Product variant retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get variant by ID endpoint error", {
        variantId: req.params?.id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch product variant");
    }
  }),

  create: asyncHandler(async (req, res) => {
    try {
      const { productId, size, stockQuantity, active } = req.body;

      logger.info("Create variant endpoint called", { productId, size });

      const variant = await ProductVariantService.create({
        productId,
        size,
        stockQuantity,
        active,
      });

      return createdResponse({
        res,
        data: variant,
        message: "Product variant created successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Create variant endpoint error", { error: error?.message });
      throw new ApiError(500, "Failed to create product variant");
    }
  }),

  replaceForProduct: asyncHandler(async (req, res) => {
    try {
      const { productId } = req.params;
      const { variants } = req.body;

      logger.info("Replace product variants endpoint called", {
        productId,
        count: variants?.length,
      });

      const result = await ProductVariantService.replaceForProduct(
        productId,
        variants,
      );

      return okResponse({
        res,
        data: result.data,
        meta: { summary: result.summary },
        message: `${result.data.length} size${result.data.length === 1 ? "" : "s"} saved successfully`,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Replace product variants endpoint error", {
        productId: req.params?.productId,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to save product variants");
    }
  }),

  update: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      logger.info("Update variant endpoint called", {
        variantId: id,
        fields: Object.keys(req.body ?? {}),
      });

      const variant = await ProductVariantService.update(id, req.body);

      return okResponse({
        res,
        data: variant,
        message: "Product variant updated successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Update variant endpoint error", {
        variantId: req.params?.id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update product variant");
    }
  }),

  updateStock: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const { stockQuantity } = req.body;

      logger.info("Update variant stock endpoint called", {
        variantId: id,
        stockQuantity,
      });

      if (stockQuantity === undefined) {
        throw new ApiError(400, "Stock quantity is required");
      }

      const variant = await ProductVariantService.update(id, { stockQuantity });

      return okResponse({
        res,
        data: variant,
        message: "Stock updated successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Update variant stock endpoint error", {
        variantId: req.params?.id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update stock");
    }
  }),

  bulkSetActive: asyncHandler(async (req, res) => {
    try {
      const { variantIds, active } = req.body;

      logger.info("Bulk variant status endpoint called", {
        count: variantIds?.length,
        active,
      });

      const result = await ProductVariantService.bulkSetActive({
        variantIds,
        active,
      });

      return okResponse({
        res,
        data: result.data,
        meta: { count: result.count, missing: result.missing },
        message: `${result.count} size${result.count === 1 ? "" : "s"} ${
          active ? "put back on sale" : "taken off sale"
        }`,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Bulk variant status endpoint error", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update those sizes");
    }
  }),

  bulkDelete: asyncHandler(async (req, res) => {
    try {
      const { variantIds, force } = req.body;

      logger.info("Bulk variant delete endpoint called", {
        count: variantIds?.length,
        force,
      });

      const result = await ProductVariantService.bulkDelete({
        variantIds,
        force,
      });

      // Always 200, never 207 or an error: a selection where some rows
      // were protected is a normal outcome the screen renders, not a
      // failed request.
      return okResponse({
        res,
        data: result,
        message: result.deleted
          ? `${result.deleted} size${result.deleted === 1 ? "" : "s"} deleted${
              result.blocked.length
                ? `, ${result.blocked.length} kept because they still hold stock`
                : ""
            }`
          : "Nothing was deleted — every selected size still holds stock",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Bulk variant delete endpoint error", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to delete those sizes");
    }
  }),

  delete: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      logger.info("Delete variant endpoint called", { variantId: id });

      await ProductVariantService.delete(id);

      return noContentResponse(res);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Delete variant endpoint error", {
        variantId: req.params?.id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to delete product variant");
    }
  }),
};
