// src/controllers/product_image.controller.js

import {
  MAX_IMAGES_PER_PRODUCT,
  ProductImageService,
} from "../services/product_image.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import {
  createdResponse,
  noContentResponse,
  okResponse,
} from "../utils/apiResponse.js";

/**
 * Alt text arrives as a repeated multipart field, positional against the
 * files. One `altText` in the form is a string, several are an array —
 * normalize both to an array so the service sees one shape.
 */
const toAltTexts = (value) => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

export const ProductImageController = {
  getByProduct: asyncHandler(async (req, res) => {
    try {
      const { productId } = req.params;

      logger.info("Get product images endpoint called", { productId });

      const data = await ProductImageService.getByProduct(productId);

      return okResponse({
        res,
        data,
        meta: {
          count: data.length,
          maxImages: MAX_IMAGES_PER_PRODUCT,
          // Position 0, or null for a product with no photographs yet.
          primaryImage: data[0] ?? null,
        },
        message: "Product images retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get product images endpoint error", {
        productId: req.params?.productId,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch product images");
    }
  }),

  getAll: asyncHandler(async (req, res) => {
    try {
      const { page = 1, limit = 200 } = req.query;

      logger.info("Get all product images endpoint called", { page, limit });

      const result = await ProductImageService.getAll({ page, limit });

      return okResponse({
        res,
        data: result.data,
        meta: {
          galleries: result.galleries,
          pagination: result.pagination,
          maxImages: MAX_IMAGES_PER_PRODUCT,
        },
        message: "Product images retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get all product images endpoint error", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch product images");
    }
  }),

  upload: asyncHandler(async (req, res) => {
    try {
      const { productId } = req.params;

      logger.info("Upload product images endpoint called", {
        productId,
        fileCount: req.files?.length ?? 0,
      });

      const result = await ProductImageService.uploadForProduct(
        productId,
        req.files ?? [],
        toAltTexts(req.body?.altText),
      );

      return createdResponse({
        res,
        data: result.images,
        meta: {
          added: result.added,
          count: result.images.length,
          maxImages: MAX_IMAGES_PER_PRODUCT,
          primaryImage: result.images[0] ?? null,
        },
        message: `${result.added} image${result.added === 1 ? "" : "s"} added`,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Upload product images endpoint error", {
        productId: req.params?.productId,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to upload product images");
    }
  }),

  update: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      logger.info("Update product image endpoint called", { id });

      const data = await ProductImageService.updateAltText(id, req.body ?? {});

      return okResponse({
        res,
        data,
        message: "Image updated successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Update product image endpoint error", {
        id: req.params?.id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update image");
    }
  }),

  reorder: asyncHandler(async (req, res) => {
    try {
      const { productId } = req.params;
      const { imageIds } = req.body ?? {};

      logger.info("Reorder product images endpoint called", {
        productId,
        count: imageIds?.length,
      });

      const data = await ProductImageService.reorder(productId, imageIds);

      return okResponse({
        res,
        data,
        meta: {
          count: data.length,
          primaryImage: data[0] ?? null,
        },
        message: "Image order saved",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Reorder product images endpoint error", {
        productId: req.params?.productId,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to reorder product images");
    }
  }),

  delete: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      logger.info("Delete product image endpoint called", { id });

      await ProductImageService.delete(id);

      return noContentResponse(res);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Delete product image endpoint error", {
        id: req.params?.id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to delete image");
    }
  }),
};
