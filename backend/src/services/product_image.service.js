// src/services/product_image.service.js

import { ProductImageRepository } from "../repository/product_image.repository.js";
import { ProductRepository } from "../repository/poduct.repository.js";
import { ProductImageMapper } from "../mapper/product_image.mapper.js";
import { UpdateProductImageDTO } from "../dto/product_image.dto.js";
import { CloudinaryStorage } from "../config/cloudinary.cdn.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * A garment is sold on front, back, drape and a fabric close-up, plus a
 * little room. Past that, a gallery is a slideshow nobody scrolls and a
 * page nobody waits for.
 */
export const MAX_IMAGES_PER_PRODUCT = 8;

/** Everything a product's photographs are filed under on Cloudinary. */
const CLOUDINARY_FOLDER = "products";

const assertUuid = (value, message) => {
  const normalized = String(value ?? "").trim();

  if (!normalized || !UUID_REGEX.test(normalized)) {
    throw new ApiError(400, message);
  }

  return normalized;
};

export const ProductImageService = {
  async getByProduct(productId) {
    try {
      const normalizedId = assertUuid(productId, "Invalid product ID");

      logger.info("Fetching product images", { productId: normalizedId });

      const rows = await ProductImageRepository.findByProductId(normalizedId);

      return ProductImageMapper.toDTOList(rows);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ProductImageService.getByProduct failed", {
        productId,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch product images");
    }
  },

  async getAll({ page = 1, limit = 200 } = {}) {
    try {
      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);

      logger.info("Fetching all product images", {
        page: safePage,
        limit: safeLimit,
      });

      const result = await ProductImageRepository.findAll({
        page: safePage,
        limit: safeLimit,
      });

      const totalPages =
        result.total === 0 ? 0 : Math.ceil(result.total / safeLimit);

      return {
        data: ProductImageMapper.toDTOList(result.rows),
        galleries: ProductImageMapper.toGalleries(result.rows),
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

      logger.error("ProductImageService.getAll failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch product images");
    }
  },

  /**
   * Uploads files to Cloudinary and appends them to a product's gallery.
   *
   * The product is checked, and the room left in its gallery counted,
   * before anything is uploaded — an upload that the database was always
   * going to reject is an asset paid for and orphaned.
   *
   * If the registration fails after the bytes are on Cloudinary, the
   * uploads are removed again, so a failed request leaves nothing behind.
   *
   * @param {string} productId
   * @param {Array<{buffer: Buffer, originalname?: string}>} files
   * @param {string[]} [altTexts]  positional, one per file; blanks allowed
   * @returns {Promise<{images: object[], added: number}>}
   */
  async uploadForProduct(productId, files, altTexts = []) {
    const uploaded = [];

    try {
      const normalizedId = assertUuid(productId, "Invalid product ID");

      if (!Array.isArray(files) || files.length === 0) {
        throw new ApiError(400, "At least one image file is required");
      }

      const product = await ProductRepository.findById(normalizedId);

      if (!product) {
        throw new ApiError(404, "Product not found");
      }

      const existing =
        await ProductImageRepository.countByProductId(normalizedId);

      const room = MAX_IMAGES_PER_PRODUCT - existing;

      if (room <= 0) {
        throw new ApiError(
          409,
          `This product already has the maximum of ${MAX_IMAGES_PER_PRODUCT} images. Remove one before adding another.`,
        );
      }

      if (files.length > room) {
        throw new ApiError(
          409,
          `Only ${room} more image${room === 1 ? "" : "s"} can be added — a product holds at most ${MAX_IMAGES_PER_PRODUCT}.`,
        );
      }

      logger.info("Uploading product images", {
        productId: normalizedId,
        count: files.length,
        existing,
      });

      for (const [index, file] of files.entries()) {
        if (!file?.buffer) {
          throw new ApiError(400, `Image at position ${index + 1} is empty`);
        }

        const result = await CloudinaryStorage.uploadImage(file.buffer, {
          folder: CLOUDINARY_FOLDER,
        });

        if (!result?.imageUrl || !result?.imagePublicId) {
          throw new ApiError(502, "Image upload did not return a usable URL");
        }

        const altText = altTexts[index];

        uploaded.push({
          imageUrl: result.imageUrl,
          imagePublicId: result.imagePublicId,
          altText:
            typeof altText === "string" && altText.trim()
              ? altText.trim().slice(0, 200)
              : null,
        });
      }

      const rows = await ProductImageRepository.appendForProduct(
        normalizedId,
        uploaded,
      );

      logger.info("Product images uploaded successfully", {
        productId: normalizedId,
        added: uploaded.length,
        total: rows.length,
      });

      return {
        images: ProductImageMapper.toDTOList(rows),
        added: uploaded.length,
      };
    } catch (error) {
      // The bytes are on Cloudinary but nothing points at them. Remove
      // them rather than leaving the account to accumulate orphans.
      if (uploaded.length > 0) {
        logger.warn("Rolling back product image uploads", {
          productId,
          count: uploaded.length,
        });

        await Promise.allSettled(
          uploaded.map((image) =>
            CloudinaryStorage.deleteImage(image.imagePublicId),
          ),
        );
      }

      if (error instanceof ApiError) throw error;

      if (error?.code === "IMAGE_PRODUCT_NOT_FOUND") {
        throw new ApiError(404, "Product not found");
      }

      if (error?.code === "IMAGE_ALREADY_REGISTERED") {
        throw new ApiError(409, "That image is already on this product");
      }

      if (error?.code === "IMAGE_UPLOAD_FAILED") {
        throw new ApiError(
          502,
          "The image service rejected the upload. Try again.",
        );
      }

      logger.error("ProductImageService.uploadForProduct failed", {
        productId,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to upload product images");
    }
  },

  async updateAltText(imageId, updateData = {}) {
    try {
      const normalizedId = assertUuid(imageId, "Invalid image ID");

      const dto = new UpdateProductImageDTO(updateData);

      if (dto.altText === undefined) {
        throw new ApiError(400, "Alt text is required to update an image");
      }

      logger.info("Updating product image alt text", { imageId: normalizedId });

      const row = await ProductImageRepository.updateAltText(
        normalizedId,
        dto.altText,
      );

      if (!row) throw new ApiError(404, "Image not found");

      return ProductImageMapper.toDTO(row);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ProductImageService.updateAltText failed", {
        imageId,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update image");
    }
  },

  /**
   * Sets a product's gallery order. `imageIds` must be exactly the
   * product's images — a partial list would silently demote whatever was
   * left out, which is never what a drag-and-drop meant to say.
   */
  async reorder(productId, imageIds) {
    try {
      const normalizedProductId = assertUuid(productId, "Invalid product ID");

      if (!Array.isArray(imageIds) || imageIds.length === 0) {
        throw new ApiError(400, "Image IDs are required");
      }

      const normalizedIds = imageIds.map((id, index) =>
        assertUuid(id, `Invalid image ID at position ${index + 1}`),
      );

      if (new Set(normalizedIds).size !== normalizedIds.length) {
        throw new ApiError(400, "The same image was listed more than once");
      }

      const existing =
        await ProductImageRepository.findByProductId(normalizedProductId);

      if (existing.length === 0) {
        throw new ApiError(404, "This product has no images to reorder");
      }

      const owned = new Set(existing.map((row) => row.id));

      const foreign = normalizedIds.find((id) => !owned.has(id));

      if (foreign) {
        throw new ApiError(400, "An image in the order is not on this product");
      }

      if (normalizedIds.length !== existing.length) {
        throw new ApiError(
          400,
          `The order must list all ${existing.length} images of this product`,
        );
      }

      logger.info("Reordering product images", {
        productId: normalizedProductId,
        count: normalizedIds.length,
      });

      const rows = await ProductImageRepository.reorderForProduct(
        normalizedProductId,
        normalizedIds,
      );

      return ProductImageMapper.toDTOList(rows);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ProductImageService.reorder failed", {
        productId,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to reorder product images");
    }
  },

  /**
   * Removes one image, from the database first and Cloudinary second.
   *
   * That order is deliberate: a failed Cloudinary delete leaves an
   * unreferenced asset, which costs storage, while the reverse would
   * leave a row pointing at a URL that 404s on the storefront.
   */
  async delete(imageId) {
    try {
      const normalizedId = assertUuid(imageId, "Invalid image ID");

      logger.info("Product image delete request", { imageId: normalizedId });

      const row = await ProductImageRepository.delete(normalizedId);

      if (!row) throw new ApiError(404, "Image not found");

      if (row.image_public_id) {
        try {
          await CloudinaryStorage.deleteImage(row.image_public_id);
        } catch (cloudinaryError) {
          logger.error("Image row deleted but Cloudinary delete failed", {
            imageId: normalizedId,
            imagePublicId: row.image_public_id,
            error: cloudinaryError?.message,
          });
        }
      }

      return { id: row.id, productId: row.product_id };
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ProductImageService.delete failed", {
        imageId,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to delete image");
    }
  },
};
