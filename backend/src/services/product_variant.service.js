// src/services/product_variant.service.js

import { ProductVariantRepository } from "../repository/product_variant.repository.js";
import { ProductRepository } from "../repository/poduct.repository.js";
import {
  CreateProductVariantDTO,
  UpdateProductVariantDTO,
} from "../dto/product_variant.dto.js";
import { ProductVariantMapper } from "../mapper/product_variant.mapper.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_SIZES_PER_PRODUCT = 50;

const assertUuid = (value, label) => {
  const normalized = String(value ?? "").trim();
  if (!normalized || !UUID_REGEX.test(normalized)) {
    throw new ApiError(400, `Invalid ${label}`);
  }
  return normalized;
};

const normalizeSize = (value, context) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, `${context}: size is required`);
  }

  const size = value.trim().toUpperCase();

  if (size.length > 20) {
    throw new ApiError(400, `${context}: size must not exceed 20 characters`);
  }

  return size;
};

const normalizeStock = (value, context) => {
  if (value === undefined || value === null || value === "") return 0;

  const stock = Number(value);

  if (!Number.isInteger(stock)) {
    throw new ApiError(400, `${context}: stock must be a whole number`);
  }

  if (stock < 0) {
    throw new ApiError(400, `${context}: stock cannot be negative`);
  }

  if (stock > 1_000_000) {
    throw new ApiError(400, `${context}: stock exceeds the maximum of 1,000,000`);
  }

  return stock;
};

const normalizeBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
};

export const ProductVariantService = {
  async getByProductId(productId) {
    try {
      const id = assertUuid(productId, "product ID");

      const variants = await ProductVariantRepository.findByProductId(id);

      logger.info("Product variants fetched", {
        productId: id,
        count: variants.length,
      });

      return {
        data: ProductVariantMapper.toDTOList(variants),
        summary: ProductVariantMapper.toSummary(variants),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ProductVariantService.getByProductId failed", {
        productId,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch product variants");
    }
  },

  /**
   * Every variant, with a per-product roll-up. The admin product list
   * shows a stock column for every row on the page, so it reads this
   * once instead of one request per product.
   */
  async getAll({ page = 1, limit = 100 } = {}) {
    try {
      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);

      const result = await ProductVariantRepository.findAll({
        page: safePage,
        limit: safeLimit,
      });

      const byProduct = {};
      for (const row of result.rows) {
        (byProduct[row.product_id] ||= []).push(row);
      }

      const summaries = Object.fromEntries(
        Object.entries(byProduct).map(([productId, rows]) => [
          productId,
          ProductVariantMapper.toSummary(rows),
        ]),
      );

      const totalPages =
        result.total === 0 ? 0 : Math.ceil(result.total / safeLimit);

      logger.info("All product variants fetched", {
        page: safePage,
        returned: result.rows.length,
        total: result.total,
      });

      return {
        data: ProductVariantMapper.toDTOList(result.rows),
        summaries,
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

      logger.error("ProductVariantService.getAll failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch product variants");
    }
  },

  async getById(id) {
    try {
      const variantId = assertUuid(id, "variant ID");

      const variant = await ProductVariantRepository.findById(variantId);
      if (!variant) throw new ApiError(404, "Product variant not found");

      return ProductVariantMapper.toDTO(variant);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ProductVariantService.getById failed", {
        variantId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch product variant");
    }
  },

  async create({ productId, size, stockQuantity, active } = {}) {
    try {
      const id = assertUuid(productId, "product ID");

      const exists = await ProductRepository.exists(id);
      if (!exists) throw new ApiError(404, "Product not found");

      const dto = new CreateProductVariantDTO({
        productId: id,
        size: normalizeSize(size, "Variant"),
        stockQuantity: normalizeStock(stockQuantity, "Variant"),
        active: normalizeBoolean(active, true),
      });

      const variant = await ProductVariantRepository.create(dto);

      logger.info("Product variant created", {
        variantId: variant.id,
        productId: id,
      });

      return ProductVariantMapper.toDTO(variant);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      if (error?.code === "VARIANT_SIZE_EXISTS") {
        throw new ApiError(409, "This product already has that size");
      }

      if (error?.code === "VARIANT_PRODUCT_NOT_FOUND") {
        throw new ApiError(404, "Product not found");
      }

      if (error?.code === "VARIANT_STOCK_NEGATIVE") {
        throw new ApiError(400, "Stock cannot be negative");
      }

      logger.error("ProductVariantService.create failed", {
        productId,
        size,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to create product variant");
    }
  },

  /**
   * Makes a product's size set exactly match what was sent.
   *
   * This is what the product form saves: the admin edits the whole set
   * of sizes at once, so it is written at once. A size dropped from the
   * list is deleted — which is why the screen warns before removing one
   * that still holds stock.
   */
  async replaceForProduct(productId, variants) {
    try {
      const id = assertUuid(productId, "product ID");

      if (!Array.isArray(variants)) {
        throw new ApiError(400, "Variants must be an array");
      }

      if (variants.length > MAX_SIZES_PER_PRODUCT) {
        throw new ApiError(
          400,
          `A product may not have more than ${MAX_SIZES_PER_PRODUCT} sizes`,
        );
      }

      const exists = await ProductRepository.exists(id);
      if (!exists) throw new ApiError(404, "Product not found");

      const seen = new Set();
      const normalized = variants.map((variant, index) => {
        const context = `Variant at index ${index}`;
        const size = normalizeSize(variant?.size, context);

        if (seen.has(size)) {
          throw new ApiError(400, `Size "${size}" is listed more than once`);
        }
        seen.add(size);

        return {
          size,
          stockQuantity: normalizeStock(variant?.stockQuantity, context),
          active: normalizeBoolean(variant?.active, true),
        };
      });

      logger.info("Replacing product variants", {
        productId: id,
        count: normalized.length,
      });

      const rows = await ProductVariantRepository.replaceForProduct(
        id,
        normalized,
      );

      return {
        data: ProductVariantMapper.toDTOList(rows),
        summary: ProductVariantMapper.toSummary(rows),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;

      if (error?.code === "VARIANT_STOCK_NEGATIVE") {
        throw new ApiError(400, "Stock cannot be negative");
      }

      logger.error("ProductVariantService.replaceForProduct failed", {
        productId,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to save product variants");
    }
  },

  async update(id, updateData = {}) {
    try {
      const variantId = assertUuid(id, "variant ID");

      const hasFields =
        updateData.size !== undefined ||
        updateData.stockQuantity !== undefined ||
        updateData.active !== undefined;

      if (!hasFields) {
        throw new ApiError(400, "At least one field is required to update");
      }

      const patch = {};

      if (updateData.size !== undefined) {
        patch.size = normalizeSize(updateData.size, "Variant");
      }

      if (updateData.stockQuantity !== undefined) {
        patch.stockQuantity = normalizeStock(updateData.stockQuantity, "Variant");
      }

      if (updateData.active !== undefined) {
        patch.active = normalizeBoolean(updateData.active, true);
      }

      const dto = new UpdateProductVariantDTO(patch);

      const variant = await ProductVariantRepository.update(variantId, dto);
      if (!variant) throw new ApiError(404, "Product variant not found");

      logger.info("Product variant updated", { variantId });
      return ProductVariantMapper.toDTO(variant);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      if (error?.code === "VARIANT_SIZE_EXISTS") {
        throw new ApiError(409, "This product already has that size");
      }

      if (error?.code === "VARIANT_STOCK_NEGATIVE") {
        throw new ApiError(400, "Stock cannot be negative");
      }

      logger.error("ProductVariantService.update failed", {
        variantId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update product variant");
    }
  },

  async delete(id) {
    try {
      const variantId = assertUuid(id, "variant ID");

      const deleted = await ProductVariantRepository.delete(variantId);
      if (!deleted) throw new ApiError(404, "Product variant not found");

      logger.info("Product variant deleted", { variantId });
      return { id: deleted.id };
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ProductVariantService.delete failed", {
        variantId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to delete product variant");
    }
  },
};
