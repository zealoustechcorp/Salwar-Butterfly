// src/services/product.service.js - PRODUCTION GRADE

import { ProductRepository } from "../repository/poduct.repository.js";
import { SizeChartRepository } from "../repository/size_chart.repository.js";
import { CategoryRepository } from "../repository/category.repository.js";
import { SubCategoryRepository } from "../repository/sub_categories.repository.js";
import { CreateProductDTO, UpdateProductDTO } from "../dto/product.dto.js";
import { ProductMapper } from "../mapper/product.mapper.js";
import { ImageStorage } from "../config/r2.storage.js";
import { FIT_GROUP } from "../config/attribute.groups.js";
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

/**
 * Resolves `attributes.fit` against the charts the shop publishes.
 *
 * A fit is not free text the way a fabric is. The storefront picks the
 * table it prints beside the Buy button by matching this string against
 * `size_charts.fit`, so a value with no chart behind it is a product
 * whose size guide falls back to showing every chart the shop has —
 * which is the failure this feature exists to remove, appearing silently
 * rather than as an error the admin can see.
 *
 * Two things happen here, and the second is the quiet one:
 *
 *   - a fit no chart is published for is refused, with the fits that
 *     are, so the message names the fix
 *   - a fit that matches is rewritten to the chart's own spelling.
 *     `findByFit` is case-insensitive, so "slim fit" from an import
 *     resolves — and is stored as "Slim Fit", because the storefront
 *     matches on the string and a product should not depend on how it
 *     was typed
 *
 * A chart the shop has taken down still resolves. Its `fit` is still a
 * fit the shop cuts, the products carrying it are still on sale, and
 * refusing an edit to one of them because the chart is off would make
 * withdrawing a chart a catalogue-wide event.
 *
 * The same reasoning covers a chart that has been deleted outright, for
 * an edit that does not touch the fit: `storedFit` is what the product
 * already carries, and a save that sends it back unchanged is not asking
 * to adopt a fit, so it is not checked. Without that, deleting a chart
 * made every product cut to it uneditable — a price change refused over
 * a size guide nobody was changing.
 *
 * @param {object|null|undefined} attributes  the normalised document
 * @param {Map<string, string>|null} [seen]  fit -> canonical, for the bulk
 *        path, where a thousand products share a handful of fits
 * @param {string|null} [storedFit]  the fit the product already carries
 * @returns {Promise<object>} the attributes, with `fit` canonicalised
 */
export const resolveFit = async (attributes, seen = null, storedFit = null) => {
  if (!attributes || typeof attributes !== "object") return attributes ?? {};

  const fit = attributes[FIT_GROUP];

  // Absent means "not recorded", which is a product the storefront shows
  // every chart for — the behaviour every product had before fits were
  // recorded at all.
  if (typeof fit !== "string" || !fit.trim()) return attributes;

  const wanted = fit.trim();

  if (
    typeof storedFit === "string" &&
    storedFit.trim().toLowerCase() === wanted.toLowerCase()
  ) {
    return { ...attributes, [FIT_GROUP]: storedFit };
  }
  const cached = seen?.get(wanted.toLowerCase());

  if (cached) return { ...attributes, [FIT_GROUP]: cached };

  const chart = await SizeChartRepository.findByFit(wanted);

  if (!chart) {
    const published = await SizeChartRepository.list();
    const names = published.map((row) => row.fit).join(", ");

    throw new ApiError(
      400,
      names
        ? `No size chart is published for the fit "${wanted}". The shop's fits are: ${names}`
        : `No size chart is published for the fit "${wanted}"`,
      { attributes: `"${wanted}" is not one of the shop's fits` },
    );
  }

  seen?.set(wanted.toLowerCase(), chart.fit);

  return { ...attributes, [FIT_GROUP]: chart.fit };
};

/** The 409 every slug clash becomes, naming the slug where it is known. */
const slugConflict = (slug) => {
  const message = slug
    ? `A product with the slug "${slug}" already exists`
    : "A product with this slug already exists";

  return new ApiError(409, message, { slug: message });
};

/**
 * The category a product is being filed under, which must still exist.
 *
 * Categories are soft-deleted, so the foreign key alone accepts one the
 * admin has already deleted: the product is written, and lands in a
 * category no screen lists and the storefront hides. Inactive is allowed
 * — that is how a collection is stocked before it is switched on.
 *
 * @returns {Promise<object>} the category row
 */
const assertCategoryUsable = async (categoryId) => {
  const category = await CategoryRepository.findById(categoryId);

  if (!category) {
    throw new ApiError(404, "Category not found", {
      categoryId: "Category not found or has been deleted",
    });
  }

  return category;
};

/**
 * A sub-category is a heading inside one category, so a product may only
 * carry one from its own category. Nothing enforced that: the foreign key
 * only asks that the sub-category exists somewhere.
 */
const assertSubCategoryBelongs = async (
  subCategoryId,
  categoryId,
  field = "subCategoryId",
) => {
  if (!subCategoryId) return;

  const subCategory = await SubCategoryRepository.findById(subCategoryId);

  if (!subCategory) {
    throw new ApiError(404, "Sub-category not found", {
      [field]: "Sub-category not found",
    });
  }

  if (String(subCategory.category_id) !== String(categoryId)) {
    throw new ApiError(400, "Sub-category belongs to a different category", {
      [field]: `"${subCategory.name}" belongs to a different category`,
    });
  }
};

export const ProductService = {
  async create({
    name,
    slug,
    description = null,
    categoryId,
    subCategoryId = null,
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

      await assertCategoryUsable(normalizedCategoryId);
      await assertSubCategoryBelongs(
        normalizedSubCategoryId,
        normalizedCategoryId,
      );

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
        basePrice: price,
        discountPercentage: discount,
        currentPrice,
        attributes: await resolveFit(attributes ?? {}),
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
        throw slugConflict(error.slug ?? slug);
      }

      if (error?.code === "PRODUCT_FOREIGN_KEY_VIOLATION") {
        logger.warn("Product creation failed - invalid category", {
          categoryId,
        });
        throw new ApiError(400, "Invalid category or sub-category ID");
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

      // The row-level rules (types, slug pattern, lengths, uuids) belong to
      // validateBulkCreateProducts, which checks every row before this
      // runs. What is left here is what needs the database.
      await assertCategoryUsable(normalizedCategoryId);

      const processedProducts = [];

      // A thousand products off one spreadsheet share a handful of fits,
      // so the charts are looked up once per distinct fit rather than
      // once per row.
      const fitsSeen = new Map();

      for (let i = 0; i < productsData.length; i++) {
        const p = productsData[i];

        if (!p.name || !p.slug || p.basePrice === undefined) {
          throw new ApiError(
            400,
            `Product at index ${i}: name, slug, and basePrice are required`,
          );
        }

        const price = parseFloat(p.basePrice);
        if (!Number.isFinite(price) || price < 0.01) {
          throw new ApiError(
            400,
            `Product at index ${i}: basePrice must be at least 0.01`,
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

        // The same rule the single-product create applies, and it matters
        // more here: this path inserts up to a thousand rows in one
        // statement, so a discount that zeroes them out is a catalogue of
        // free products rather than one.
        if (currentPrice < 0.01) {
          throw new ApiError(
            400,
            `Product at index ${i}: ${
              discount >= 100
                ? "a 100% discount would make this product free"
                : "that discount leaves the customer paying 0"
            }`,
          );
        }

        // Which row carried the unknown fit, in a payload of a thousand.
        // Without the index the shop is told a fit is wrong and left to
        // find it in the spreadsheet themselves.
        let attributes;
        try {
          attributes = await resolveFit(
            p.attributes && typeof p.attributes === "object" ? p.attributes : {},
            fitsSeen,
          );
        } catch (error) {
          if (error instanceof ApiError && error.statusCode === 400) {
            throw new ApiError(400, `Product at index ${i}: ${error.message}`);
          }
          throw error;
        }

        if (p.subCategoryId) {
          try {
            await assertSubCategoryBelongs(
              String(p.subCategoryId).trim(),
              normalizedCategoryId,
              `products[${i}].subCategoryId`,
            );
          } catch (error) {
            if (error instanceof ApiError) {
              throw new ApiError(
                error.statusCode,
                `Product at index ${i}: ${error.message}`,
                error.errors,
              );
            }
            throw error;
          }
        }

        processedProducts.push({
          name: p.name.trim(),
          slug: p.slug.trim().toLowerCase(),
          description: p.description ? p.description.trim() : null,
          subCategoryId: p.subCategoryId ? String(p.subCategoryId).trim() : null,
          basePrice: price,
          discountPercentage: discount,
          currentPrice,
          attributes,
          isFeatured: p.isFeatured === true || p.isFeatured === "true",
          active: p.active !== false && p.active !== "false",
        });
      }

      // Slugs already in the catalogue, found up front and reported by
      // row. Left to the insert, one clash fails all thousand rows with
      // a unique violation naming whichever row Postgres reached first.
      const taken = new Set(
        await ProductRepository.findExistingSlugs(
          processedProducts.map((p) => p.slug),
        ),
      );

      if (taken.size > 0) {
        const errors = {};
        processedProducts.forEach((p, index) => {
          if (taken.has(p.slug)) {
            errors[`products[${index}].slug`] =
              `A product with the slug "${p.slug}" already exists`;
          }
        });

        const listed = [...taken].slice(0, 10).join(", ");
        const more = taken.size > 10 ? ", ..." : "";

        throw new ApiError(
          409,
          `${taken.size} slug${taken.size === 1 ? " is" : "s are"} already in use: ${listed}${more}`,
          errors,
        );
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

      // A slug taken between the pre-flight above and the insert.
      if (error?.code === "PRODUCT_SLUG_EXISTS") {
        logger.warn("Bulk product creation failed - slug already exists", {
          categoryId,
          slug: error.slug,
        });
        throw slugConflict(error.slug);
      }

      if (error?.code === "PRODUCT_FOREIGN_KEY_VIOLATION") {
        throw new ApiError(400, "Invalid category or sub-category ID");
      }

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

      // Not deleted. Inactive is allowed, as on create: moving pieces into
      // a collection that is not switched on yet is how one is built.
      await assertCategoryUsable(normalizedCategoryId);

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
        updateData.subCategoryId !== undefined;

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

      // Read first: an unknown id is a 404 here rather than a repository
      // error further down, and the stored row is what the sub-category,
      // the fit and the prices below are all checked against.
      const product = await ProductRepository.findById(normalizedProductId);

      if (!product) throw new ApiError(404, "Product not found");

      if (finalData.subCategoryId) {
        await assertSubCategoryBelongs(
          String(finalData.subCategoryId).trim(),
          product.category_id,
        );
      }

      // The attributes document is replaced wholesale by an update, so a
      // fit arriving here is the fit the product will carry — it has to
      // be resolved against the charts on the way in exactly as it is on
      // create, or the edit screen becomes the way round the rule. The
      // stored fit is passed so that sending it back unchanged is not
      // re-checked (see resolveFit).
      if (updateData.attributes !== undefined) {
        finalData.attributes = await resolveFit(
          finalData.attributes,
          null,
          product.attributes?.[FIT_GROUP] ?? null,
        );
      }

      if (
        updateData.basePrice !== undefined ||
        updateData.discountPercentage !== undefined
      ) {
        const base =
          updateData.basePrice !== undefined
            ? parseFloat(updateData.basePrice)
            : parseFloat(product.base_price);
        const discount =
          updateData.discountPercentage !== undefined
            ? parseFloat(updateData.discountPercentage)
            : parseFloat(product.discount_percentage);

        // A paisa, not "more than zero": prices are DECIMAL(10,2), so
        // 0.004 is a positive number the column stores as 0.00.
        if (!Number.isFinite(base) || base < 0.01) {
          throw new ApiError(400, "Base price must be at least 0.01", {
            basePrice: "Base price must be at least 0.01",
          });
        }

        if (discount < 0 || discount > 100) {
          throw new ApiError(
            400,
            "Discount percentage must be between 0 and 100",
            { discountPercentage: "Discount percentage must be between 0 and 100" },
          );
        }

        finalData.currentPrice = calculateCurrentPrice(base, discount);

        // The guard on the derived figure, and the reason it lives here
        // rather than in the validator: an update may send only one of the
        // two prices, so what the customer would end up paying is not
        // knowable until the sent field is merged with the stored one —
        // which is exactly what the lines above just did.
        //
        // Both fields can be valid on their own and still leave a free
        // product between them: 100% off, or a base small enough that the
        // discount rounds it away.
        if (finalData.currentPrice < 0.01) {
          const message =
            discount >= 100
              ? "A 100% discount would make this product free"
              : "That discount leaves the customer paying 0";

          throw new ApiError(400, message, { discountPercentage: message });
        }
      }

      logger.info("Updating product", {
        productId: normalizedProductId,
      });

      const updated = await ProductRepository.update(
        normalizedProductId,
        finalData,
      );

      if (!updated) throw new ApiError(404, "Product not found");

      logger.info("Product updated successfully", { productId: updated.id });
      return ProductMapper.toDTO(updated);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      // Deleted between the read above and the write.
      if (error?.code === "PRODUCT_NOT_FOUND") {
        throw new ApiError(404, "Product not found");
      }

      if (error?.code === "PRODUCT_SLUG_EXISTS") {
        logger.warn("Product update failed - slug already exists", {
          productId,
        });
        throw slugConflict(error.slug ?? updateData?.slug);
      }

      if (error?.code === "PRODUCT_FOREIGN_KEY_VIOLATION") {
        throw new ApiError(400, "Invalid sub-category ID", {
          subCategoryId: "Sub-category not found",
        });
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

      // `product_images` cascades with the product, but R2 knows
      // nothing about the foreign key — without this the photographs stay
      // in the bucket with nothing left pointing at them. Best effort:
      // the product is already gone, so a failure here is a storage leak
      // to clean up later, not a reason to report the delete as failed.
      const images = Array.isArray(product.images) ? product.images : [];

      if (images.length > 0) {
        const results = await Promise.allSettled(
          images
            .filter((image) => image.imagePublicId)
            .map((image) => ImageStorage.deleteImage(image.imagePublicId)),
        );

        const failed = results.filter((r) => r.status === "rejected").length;

        if (failed > 0) {
          logger.error("Product deleted but some images remain in R2", {
            productId: normalizedId,
            failed,
            total: images.length,
          });
        }
      }

      logger.info("Product deleted successfully", {
        productId: deleted.id,
        imagesRemoved: images.length,
      });

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
