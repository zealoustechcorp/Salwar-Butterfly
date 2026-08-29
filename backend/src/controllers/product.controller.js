// src/controllers/product.controller.js - FINAL PRODUCTION GRADE

import { ProductService } from "../services/product.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import {
  successResponse,
  createdResponse,
  noContentResponse,
  okResponse,
} from "../utils/apiResponse.js";

export const ProductController = {
  create: asyncHandler(async (req, res) => {
    try {
      const {
        name,
        slug,
        description,
        categoryId,
        sizeChartId,
        basePrice,
        discountPercentage,
        isFeatured,
        active,
      } = req.body;

      logger.info("Product create endpoint called", {
        name,
        slug,
        categoryId,
        hasDescription: Boolean(description),
      });

      if (!name || !slug || !categoryId || basePrice === undefined) {
        throw new ApiError(
          400,
          "Name, slug, category ID, and base price are required",
        );
      }

      const product = await ProductService.create({
        name,
        slug,
        description,
        categoryId,
        sizeChartId,
        basePrice: Number(basePrice),
        discountPercentage: discountPercentage ? Number(discountPercentage) : 0,
        isFeatured: isFeatured ?? false,
        active: active ?? true,
      });

      logger.info("Product created via endpoint", { productId: product.id });
      return createdResponse({
        res,
        data: product,
        message: "Product created successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("Create product endpoint error", { error: error?.message });
      throw new ApiError(500, "Failed to create product");
    }
  }),

  bulkCreate: asyncHandler(async (req, res) => {
    try {
      const { categoryId, products } = req.body;

      logger.info("Bulk create products endpoint called", {
        categoryId,
        count: products?.length,
      });

      if (!categoryId || !Array.isArray(products)) {
        throw new ApiError(400, "Category ID and products array are required");
      }

      const createdProducts = await ProductService.bulkCreateByCategoryId(
        categoryId,
        products,
      );

      logger.info("Bulk products created via endpoint", {
        categoryId,
        count: createdProducts.length,
      });

      return createdResponse({
        res,
        data: createdProducts,
        message: `${createdProducts.length} products created successfully`,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("Bulk create products endpoint error", {
        error: error?.message,
      });
      throw new ApiError(500, "Failed to bulk create products");
    }
  }),

  bulkUpdateCategory: asyncHandler(async (req, res) => {
    try {
      const { categoryId, productIds } = req.body;

      logger.info("Bulk update category endpoint called", {
        categoryId,
        count: productIds?.length,
      });

      if (!categoryId || !Array.isArray(productIds)) {
        throw new ApiError(
          400,
          "Category ID and product IDs array are required",
        );
      }

      if (productIds.length === 0) {
        throw new ApiError(400, "At least one product ID is required");
      }

      if (productIds.length > 1000) {
        throw new ApiError(400, "Maximum 1000 products can be updated at once");
      }

      const updated = await ProductService.bulkUpdateCategoryByProductIds(
        categoryId,
        productIds,
      );

      logger.info("Products category updated via endpoint", {
        categoryId,
        count: updated,
      });

      return okResponse({
        res,
        data: { updatedCount: updated },
        message: `${updated} products updated with category successfully`,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("Bulk update category endpoint error", {
        error: error?.message,
      });
      throw new ApiError(500, "Failed to bulk update product category");
    }
  }),

  getAll: asyncHandler(async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        categoryId = null,
        activeOnly = "false",
      } = req.query;

      logger.info("Get all products endpoint called", {
        page,
        limit,
        categoryId,
        activeOnly,
      });

      const result = await ProductService.getAllProducts({
        page,
        limit,
        categoryId,
        activeOnly: activeOnly === "true" || activeOnly === true,
      });

      logger.info("Products retrieved via endpoint", {
        page,
        limit,
        count: result.data.length,
        total: result.pagination.total,
      });

      return successResponse({
        res,
        data: result.data,
        meta: { pagination: result.pagination },
        message: "Products retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("Get all products endpoint error", {
        error: error?.message,
      });
      throw new ApiError(500, "Failed to fetch products");
    }
  }),

  getById: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      logger.info("Get product by ID endpoint called", { productId: id });

      const product = await ProductService.getProductById(id);

      logger.info("Product retrieved by ID via endpoint", { productId: id });
      return okResponse({
        res,
        data: product,
        message: "Product retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("Get product by ID endpoint error", {
        productId: req.params.id,
        error: error?.message,
      });
      throw new ApiError(500, "Failed to fetch product");
    }
  }),

  getBySlug: asyncHandler(async (req, res) => {
    try {
      const { slug } = req.params;

      logger.info("Get product by slug endpoint called", { slug });

      const product = await ProductService.getProductBySlug(slug);

      logger.info("Product retrieved by slug via endpoint", {
        productId: product.id,
        slug,
      });
      return okResponse({
        res,
        data: product,
        message: "Product retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("Get product by slug endpoint error", {
        slug: req.params.slug,
        error: error?.message,
      });
      throw new ApiError(500, "Failed to fetch product");
    }
  }),

  update: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = { ...req.body };

      logger.info("Product update endpoint called", {
        productId: id,
        fields: Object.keys(updateData),
      });

      if (!id) throw new ApiError(400, "Product ID is required");

      const product = await ProductService.updateProduct(id, updateData);

      logger.info("Product updated via endpoint", { productId: product.id });
      return okResponse({
        res,
        data: product,
        message: "Product updated successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("Update product endpoint error", {
        productId: req.params?.id,
        error: error?.message,
      });
      throw new ApiError(500, "Failed to update product");
    }
  }),

  updateStatus: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const { active } = req.body;

      logger.info("Update product status endpoint called", {
        productId: id,
        active,
      });

      if (typeof active !== "boolean") {
        throw new ApiError(400, "Active must be a boolean value");
      }

      const product = await ProductService.updateProductStatus(id, active);

      logger.info("Product status updated via endpoint", {
        productId: product.id,
        active,
      });
      return okResponse({
        res,
        data: product,
        message: "Product status updated successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("Update product status endpoint error", {
        productId: req.params.id,
        error: error?.message,
      });
      throw new ApiError(500, "Failed to update product status");
    }
  }),

  delete: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      logger.info("Product delete endpoint called", { productId: id });

      await ProductService.deleteProduct(id);

      logger.info("Product deleted via endpoint", { productId: id });
      return noContentResponse(res);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("Delete product endpoint error", {
        productId: req.params.id,
        error: error?.message,
      });
      throw new ApiError(500, "Failed to delete product");
    }
  }),
};
