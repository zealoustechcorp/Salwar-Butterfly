// src/services/storage/cloudinary.storage.js

import { v2 as cloudinary } from "cloudinary";

import { env } from "./env.js";

import { logger } from "../utils/logger.js";

// ============================================================
// CLOUDINARY CONFIGURATION
// ============================================================

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
  secure: true,
});

// ============================================================
// CLOUDINARY STORAGE
// ============================================================

export const CloudinaryStorage = {
  // ==========================================================
  // UPLOAD IMAGE
  // ==========================================================

  async uploadImage(fileBuffer, options = {}) {
    if (!Buffer.isBuffer(fileBuffer)) {
      throw new Error("IMAGE_BUFFER_REQUIRED");
    }

    const { folder = "categories", publicId } = options;

    try {
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,

            ...(publicId
              ? {
                  public_id: publicId,
                }
              : {}),

            resource_type: "image",

            overwrite: false,

            invalidate: true,
          },

          (error, result) => {
            if (error) {
              return reject(error);
            }

            resolve(result);
          },
        );

        uploadStream.end(fileBuffer);
      });

      if (!result?.secure_url || !result?.public_id) {
        throw new Error("Invalid Cloudinary upload response");
      }

      logger.info("Image uploaded to Cloudinary successfully", {
        publicId: result.public_id,
        secureUrl: result.secure_url,
      });

      return {
        imageUrl: result.secure_url,
        imagePublicId: result.public_id,
      };
    } catch (error) {
      logger.error("Cloudinary image upload failed", {
        folder,
        publicId,
        error: error.message,
        stack: error.stack,
      });

      const uploadError = new Error("IMAGE_UPLOAD_FAILED");

      uploadError.code = "IMAGE_UPLOAD_FAILED";

      throw uploadError;
    }
  },

  // ==========================================================
  // DELETE IMAGE
  // ==========================================================

  async deleteImage(publicId) {
    if (!publicId) {
      return null;
    }

    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: "image",
        invalidate: true,
      });

      logger.info("Image deleted from Cloudinary successfully", {
        publicId,
        result: result.result,
      });

      return result;
    } catch (error) {
      logger.error("Cloudinary image deletion failed", {
        publicId,
        error: error.message,
        stack: error.stack,
      });

      const deleteError = new Error("IMAGE_DELETE_FAILED");

      deleteError.code = "IMAGE_DELETE_FAILED";

      throw deleteError;
    }
  },

  // ==========================================================
  // REPLACE IMAGE
  // ==========================================================

  async replaceImage(fileBuffer, oldPublicId, options = {}) {
    const newImage = await this.uploadImage(fileBuffer, options);

    if (oldPublicId) {
      try {
        await this.deleteImage(oldPublicId);
      } catch (error) {
        logger.error("New image uploaded but old image deletion failed", {
          oldPublicId,
          newPublicId: newImage.imagePublicId,
          error: error.message,
        });
      }
    }

    return newImage;
  },
};
