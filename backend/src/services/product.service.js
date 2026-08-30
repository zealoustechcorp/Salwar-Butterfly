// src/services/product.service.js - PRODUCTION GRADE

import { ProductRepository } from "../repository/poduct.repository.js";
import { CreateProductDTO, UpdateProductDTO } from "../dto/product.dto.js";
import { ProductMapper } from "../mapper/product.mapper.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const calculateCurrentPrice = (basePrice, discountPercentage) => {
  const base = parseFloat(basePrice);
  const discount = parseFloat(discountPercentage) || 0;
  if (isNaN(base) || base < 0) return 0;
  if (discount < 0 || discount > 100) return base;
  const discountAmount = (base * discount) / 100;
  return Math.round((base - discountAmount) * 100) / 100;
};

export const ProductService = {
  async create({
    name,
    slug,
    description = null,
    categoryId,
    subCategoryId = null,
    sizeChartId = null,
    basePrice,
    discountPercentage = 0,
    attributes = {},
    isFeatured = false,
    active = true,
  } = {}) {
    try {
      if (!name || !slug || !categoryId || basePrice === undefined) {
        throw new ApiError(
          400,
          "Product name, slug, category ID, and base price are required",
        );
      }

      const normalizedName = typeof name === "string" ? name.trim() : name;
      const normalizedSlug =
        typeof slug === "string" ? slug.trim().toLowerCase() : slug;
      const normalizedDescription =
        typeof description === "string"
          ? description.trim()
          : description || null;
      const normalizedCategoryId = String(categoryId).trim();
      const normalizedSubCategoryId = subCategoryId
        ? String(subCategoryId).trim()
        : null;
      const normalizedSizeChartId = sizeChartId
        ? String(sizeChartId).trim()
        : null;

      if (!normalizedName || !normalizedSlug) {
        throw new ApiError(400, "Product name and slug cannot be empty");
      }

      if (!UUID_REGEX.test(normalizedCategoryId)) {
        throw new ApiError(400, "Invalid category ID format");
      }

      if (
        normalizedSubCategoryId &&
        !UUID_REGEX.test(normalizedSubCategoryId)
      ) {
        throw new ApiError(400, "Invalid sub-category ID format");
      }

      if (normalizedSizeChartId && !UUID_REGEX.test(normalizedSizeChartId)) {
        throw new ApiError(400, "Invalid size chart ID format");
      }

      const price = parseFloat(basePrice);
      if (isNaN(price) || price < 0) {
        throw new ApiError(400, "Base price must be a positive number");
      }

      const discount = parseFloat(discountPercentage) || 0;
      if (discount < 0 || discount > 100) {
        throw new ApiError(
          400,
          "Discount percentage must be between 0 and 100",
        );
      }

      const currentPrice = calculateCurrentPrice(price, discount);

      let normalizedActive = true;
      if (active !== undefined && active !== null) {
        if (typeof active === "boolean") normalizedActive = active;
        else if (typeof active === "string") {
          const val = active.trim().toLowerCase();
          normalizedActive =
            val === "true" ? true : val === "false" ? false : true;
        }
      }

      let normalizedFeatured = false;
      if (isFeatured !== undefined && isFeatured !== null) {
        if (typeof isFeatured === "boolean") normalizedFeatured = isFeatured;
        else if (typeof isFeatured === "string") {
          const val = isFeatured.trim().toLowerCase();
          normalizedFeatured =
            val === "true" ? true : val === "false" ? false : false;
        }
      }

      const productDTO = new CreateProductDTO({
        name: normalizedName,
        slug: normalizedSlug,
        description: normalizedDescription,
        categoryId: normalizedCategoryId,
        subCategoryId: normalizedSubCategoryId,
        sizeChartId: normalizedSizeChartId,
        basePrice: price,
        discountPercentage: discount,
        currentPrice,
        attributes: attributes ?? {},
        isFeatured: normalizedFeatured,
        active: normalizedActive,
      });

      logger.info("Creating product", {
        name: productDTO.name,
        slug: productDTO.slug,
        categoryId: productDTO.categoryId,
        basePrice: productDTO.basePrice,
        discountPercentage: productDTO.discountPercentage,
      });

      const product = await ProductRepository.create({
        categoryId: productDTO.categoryId,
        subCategoryId: productDTO.subCategoryId,
        sizeChartId: productDTO.sizeChartId,
        name: productDTO.name,
        slug: productDTO.slug,
        description: productDTO.description,
        basePrice: productDTO.basePrice,
        discountPercentage: productDTO.discountPercentage,
        currentPrice: productDTO.currentPrice,
        attributes: productDTO.attributes,
        isFeatured: productDTO.isFeatured,
        active: productDTO.active,
      });

      if (!product) {
        throw new ApiError(500, "Failed to create product");
      }

      logger.info("Product created successfully", {
        productId: product.id,
        slug: product.slug,
        categoryId: product.category_id,
      });

      return ProductMapper.toDTO(product);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      if (error?.code === "PRODUCT_SLUG_EXISTS") {
        logger.warn("Product creation failed - slug already exists", { slug });
        throw new ApiError(409, "Product slug already exists");
      }

      if (error?.code === "PRODUCT_FOREIGN_KEY_VIOLATION") {
        logger.warn(
          "Product creation failed - invalid category or size chart",
          { categoryId },
        );
        throw new ApiError(400, "Invalid category ID or size chart ID");
      }

      logger.error("ProductService.create failed", {
        error: error?.message,
        name,
        slug,
        categoryId,
      });

      throw new ApiError(500, "Failed to create product");
    }
  },

  async bulkCreateByCategoryId(categoryId, productsData) {
    try {
      if (
        !categoryId ||
        !Array.isArray(productsData) ||
        productsData.length === 0
      ) {
        throw new ApiError(400, "Category ID and products array are required");
      }

      const normalizedCategoryId = String(categoryId).trim();

      if (!UUID_REGEX.test(normalizedCategoryId)) {
        throw new ApiError(400, "Invalid category ID format");
      }

      if (productsData.length > 1000) {
        throw new ApiError(400, "Maximum 1000 products can be created in bulk");
      }

      const processedProducts = [];

      for (let i = 0; i < productsData.length; i++) {
        const p = productsData[i];

        if (!p.name || !p.slug || p.basePrice === undefined) {
          throw new ApiError(
            400,
            `Product at index ${i}: name, slug, and basePrice are required`,
          );
        }

        const price = parseFloat(p.basePrice);
        if (isNaN(price) || price < 0) {
          throw new ApiError(
            400,
            `Product at index ${i}: basePrice must be a positive number`,
          );
        }

        const discount = parseFloat(p.discountPercentage) || 0;
        if (discount < 0 || discount > 100) {
          throw new ApiError(
            400,
            `Product at index ${i}: discountPercentage must be between 0 and 100`,
          );
        }

        const currentPrice = calculateCurrentPrice(price, discount);

        processedProducts.push({
          name: p.name.trim(),
          slug: p.slug.trim().toLowerCase(),
          description: p.description ? p.description.trim() : null,
          subCategoryId: p.subCategoryId ? String(p.subCategoryId).trim() : null,
          sizeChartId: p.sizeChartId ? String(p.sizeChartId).trim() : null,
          basePrice: price,
          discountPercentage: discount,
          currentPrice,
          attributes:
            p.attributes && typeof p.attributes === "object" ? p.attributes : {},
          isFeatured: p.isFeatured === true || p.isFeatured === "true",
          active: p.active !== false && p.active !== "false",
        });
      }

      logger.info("Bulk creating products", {
        categoryId: normalizedCategoryId,
        count: processedProducts.length,
      });

      const products = await ProductRepository.bulkAdd(
        normalizedCategoryId,
        processedProducts,
      );

      if (!products || products.length === 0) {
        throw new ApiError(500, "Failed to create products");
      }

      logger.info("Products bulk created successfully", {
        categoryId: normalizedCategoryId,
        count: products.length,
      });

      return ProductMapper.toDTOList(products);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ProductService.bulkCreateByCategoryId failed", {
        categoryId,
        count: productsData?.length,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to create products");
    }
  },

  /**
   * Moves products into a category.
   *
   * This is the only way to change a product's category: updateProduct
   * deliberately does not touch `category_id`, so both the product edit
   * screen and the category screens' product assignment come through
   * here.
   *
   * @param {string} categoryId
   * @param {string[]} productIds
   * @returns {Promise<number>} how many rows were updated
   */
  async bulkUpdateCategoryByProductIds(categoryId, productIds) {
    try {
      if (!categoryId || !Array.isArray(productIds)) {
        throw new ApiError(400, "Category ID and product IDs array are required");
      }

      if (productIds.length === 0) {
        throw new ApiError(400, "At least one product ID is required");
      }

      if (productIds.length > 1000) {
        throw new ApiError(400, "Maximum 1000 products can be updated at once");
      }

      const normalizedCategoryId = String(categoryId).trim();

      if (!UUID_REGEX.test(normalizedCategoryId)) {
        throw new ApiError(400, "Invalid category ID format");
      }

      const normalizedProductIds = productIds.map((id) => String(id).trim());

      const invalid = normalizedProductIds.find((id) => !UUID_REGEX.test(id));
      if (invalid) {
        throw new ApiError(400, `Invalid product ID format: ${invalid}`);
      }

      logger.info("Bulk updating product category", {
        categoryId: normalizedCategoryId,
        count: normalizedProductIds.length,
      });

      const updated = await ProductRepository.bulkUpdateCategoryByIds(
        normalizedProductIds,
        normalizedCategoryId,
      );

      logger.info("Products moved to category", {
        categoryId: normalizedCategoryId,
        updated,
      });

      return updated;
    } catch (error) {
      if (error instanceof ApiError) throw error;

      if (error?.code === "PRODUCT_FOREIGN_KEY_VIOLATION") {
        logger.warn("Bulk category update failed - unknown category", {
          categoryId,
        });
        throw new ApiError(400, "Invalid category ID");
      }

      logger.error("ProductService.bulkUpdateCategoryByProductIds failed", {
        categoryId,
        count: productIds?.length,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update product category");
    }
  },

  async getProductById(id) {
    try {
      if (!id || !UUID_REGEX.test(String(id).trim())) {
        throw new ApiError(400, "Invalid product ID");
      }

      const normalizedId = String(id).trim();

      logger.info("Fetching product by ID", { productId: normalizedId });

      const product = await ProductRepository.findById(normalizedId);

      if (!product) throw new ApiError(404, "Product not found");

      logger.info("Product fetched successfully", { productId: product.id });
      return ProductMapper.toDTO(product);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ProductService.getProductById failed", {
        productId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch product");
    }
  },

  async getProductBySlug(slug) {
    try {
      if (!slug) throw new ApiError(400, "Product slug is required");

      const normalizedSlug = String(slug).trim().toLowerCase();

      logger.info("Fetching product by slug", { slug: normalizedSlug });

      const product = await ProductRepository.findBySlug(normalizedSlug);

      if (!product) throw new ApiError(404, "Product not found");

      logger.info("Product fetched by slug successfully", {
        productId: product.id,
      });
      return ProductMapper.toDTO(product);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ProductService.getProductBySlug failed", {
        slug,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch product");
    }
  },

  async getAllProducts({
    page = 1,
    limit = 20,
    categoryId = null,
    activeOnly = false,
  } = {}) {
    try {
      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

      let normalizedCategoryId = null;
      if (categoryId && String(categoryId).trim() !== "") {
        normalizedCategoryId = String(categoryId).trim();
        if (!UUID_REGEX.test(normalizedCategoryId)) {
          throw new ApiError(400, "Invalid category ID");
        }
      }

      logger.info("Fetching all products", {
        page: safePage,
        limit: safeLimit,
        categoryId: normalizedCategoryId,
        activeOnly,
      });

      const result = await ProductRepository.findAll({
        page: safePage,
        limit: safeLimit,
        categoryId: normalizedCategoryId,
        activeOnly,
      });

      const totalPages =
        result.total === 0 ? 0 : Math.ceil(result.total / safeLimit);

      logger.info("Products fetched successfully", {
        page: safePage,
        limit: safeLimit,
        total: result.total,
        returned: result.rows.length,
      });

      return {
        data: ProductMapper.toDTOList(result.rows),
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

      logger.error("ProductService.getAllProducts failed", {
        page,
        limit,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch products");
    }
  },

  async updateProduct(productId, updateData = {}) {
    try {
      if (!productId || !UUID_REGEX.test(String(productId).trim())) {
        throw new ApiError(400, "Invalid product ID");
      }

      const normalizedProductId = String(productId).trim();

      if (
        !updateData ||
        typeof updateData !== "object" ||
        Array.isArray(updateData)
      ) {
        throw new ApiError(400, "Product update data is required");
      }

      const hasFields =
        updateData.name !== undefined ||
        updateData.slug !== undefined ||
        updateData.description !== undefined ||
        updateData.basePrice !== undefined ||
        updateData.discountPercentage !== undefined ||
        updateData.attributes !== undefined ||
        updateData.isFeatured !== undefined ||
        updateData.active !== undefined ||
        updateData.sizeChartId !== undefined;

      if (!hasFields) {
        throw new ApiError(400, "At least one field is required to update");
      }

      logger.info("Product update request received", {
        productId: normalizedProductId,
        fields: Object.keys(updateData).filter(
          (k) => updateData[k] !== undefined,
        ),
      });

      const dto = new UpdateProductDTO(updateData);

      let finalData = { ...dto };

      if (
        updateData.basePrice !== undefined ||
        updateData.discountPercentage !== undefined
      ) {
        const product = await ProductRepository.findById(normalizedProductId);

        if (!product) throw new ApiError(404, "Product not found");

        const base =
          updateData.basePrice !== undefined
            ? parseFloat(updateData.basePrice)
            : parseFloat(product.base_price);
        const discount =
          updateData.discountPercentage !== undefined
            ? parseFloat(updateData.discountPercentage)
            : parseFloat(product.discount_percentage);

        if (isNaN(base) || base < 0) {
          throw new ApiError(400, "Base price must be a positive number");
        }

        if (discount < 0 || discount > 100) {
          throw new ApiError(
            400,
            "Discount percentage must be between 0 and 100",
          );
        }

        finalData.currentPrice = calculateCurrentPrice(base, discount);
      }

      logger.info("Updating product", {
        productId: normalizedProductId,
      });

      const product = await ProductRepository.update(
        normalizedProductId,
        finalData,
      );

      if (!product) throw new ApiError(404, "Product not found");

      logger.info("Product updated successfully", { productId: product.id });
      return ProductMapper.toDTO(product);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      if (error?.code === "PRODUCT_SLUG_EXISTS") {
        logger.warn("Product update failed - slug already exists", {
          productId,
        });
        throw new ApiError(409, "Product slug already exists");
      }

      logger.error("ProductService.updateProduct failed", {
        productId,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update product");
    }
  },

  async updateProductStatus(id, active) {
    try {
      if (!id || !UUID_REGEX.test(String(id).trim())) {
        throw new ApiError(400, "Invalid product ID");
      }

      const normalizedId = String(id).trim();

      let normalizedActive;
      if (typeof active === "boolean") {
        normalizedActive = active;
      } else if (typeof active === "string") {
        const val = active.trim().toLowerCase();
        normalizedActive =
          val === "true" ? true : val === "false" ? false : null;
        if (normalizedActive === null)
          throw new ApiError(400, "Active must be a boolean");
      } else {
        throw new ApiError(400, "Active must be a boolean");
      }

      logger.info("Product status update request", {
        productId: normalizedId,
        active: normalizedActive,
      });

      const product = await ProductRepository.updateStatus(
        normalizedId,
        normalizedActive,
      );

      if (!product) throw new ApiError(404, "Product not found");

      logger.info("Product status updated", {
        productId: product.id,
        active: product.active,
      });
      return ProductMapper.toDTO(product);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ProductService.updateProductStatus failed", {
        productId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update product status");
    }
  },

  async deleteProduct(id) {
    try {
      if (!id || !UUID_REGEX.test(String(id).trim())) {
        throw new ApiError(400, "Invalid product ID");
      }

      const normalizedId = String(id).trim();

      logger.info("Product delete request", { productId: normalizedId });

      const product = await ProductRepository.findById(normalizedId);

      if (!product) throw new ApiError(404, "Product not found");

      const deleted = await ProductRepository.delete(normalizedId);

      if (!deleted) throw new ApiError(404, "Product not found");

      logger.info("Product deleted successfully", { productId: deleted.id });

      return { id: deleted.id };
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ProductService.deleteProduct failed", {
        productId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to delete product");
    }
  },

  async productExists(id) {
    try {
      if (!id || !UUID_REGEX.test(String(id).trim())) {
        throw new ApiError(400, "Invalid product ID");
      }

      return await ProductRepository.exists(id);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to check product");
    }
  },

  async productSlugExists(slug, excludeId = null) {
    try {
      if (!slug) throw new ApiError(400, "Product slug is required");

      const normalizedSlug = String(slug).trim().toLowerCase();

      let normalizedExcludeId = null;
      if (
        excludeId !== undefined &&
        excludeId !== null &&
        String(excludeId).trim() !== ""
      ) {
        normalizedExcludeId = String(excludeId).trim();
        if (!UUID_REGEX.test(normalizedExcludeId))
          throw new ApiError(400, "Invalid product ID");
      }

      return await ProductRepository.slugExists(
        normalizedSlug,
        normalizedExcludeId,
      );
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to check product slug");
    }
  },

  async countProductsByCategory(categoryId) {
    try {
      if (!categoryId || !UUID_REGEX.test(String(categoryId).trim())) {
        throw new ApiError(400, "Invalid category ID");
      }

      return await ProductRepository.countByCategoryId(categoryId);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to count products");
    }
  },
};
