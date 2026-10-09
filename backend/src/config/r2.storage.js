// src/config/r2.storage.js
//
// The only module that talks to Cloudflare R2, where every image the
// admin uploads is kept — category covers, product galleries, banners
// and customer stories alike.
//
// R2 speaks the S3 API, so this is the AWS SDK pointed at Cloudflare's
// endpoint. The bytes are written privately through that API and read
// publicly through the bucket's custom domain (R2_PUBLIC_URL), which is
// Cloudflare's CDN — the API endpoint itself is never shown to a browser.
//
// The shape is the one CloudinaryStorage had, so the services did not
// change: uploadImage resolves to { imageUrl, imagePublicId }, and the
// "public id" stored beside every image is now the object's key in the
// bucket — the handle deleteImage needs.

import { randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { env } from "./env.js";

import { logger } from "../utils/logger.js";
import { detectImageType, IMAGE_EXTENSIONS } from "../utils/imageType.js";

// ============================================================
// R2 CLIENT
// ============================================================

const client = new S3Client({
  // R2 has no regions in the AWS sense; the SDK still insists on one.
  region: "auto",
  endpoint: `https://${env.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.r2.accessKeyId,
    secretAccessKey: env.r2.secretAccessKey,
  },
});

/**
 * Every key is new — a random name, never reused — so a URL always
 * points at the same bytes and the CDN and browsers may keep them for a
 * year without ever asking again. Replacing an image writes a new key;
 * it never overwrites an old one, which is what makes this safe.
 */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

/** The address a browser loads an object from. */
export const publicUrlFor = (key) => `${env.r2.publicUrl}/${key}`;

/**
 * Write one object. Shared with the Cloudinary migration script, which
 * already has a key and a type and must not invent new ones.
 */
export const putObject = (key, body, contentType) =>
  client.send(
    new PutObjectCommand({
      Bucket: env.r2.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: CACHE_CONTROL,
    }),
  );

// ============================================================
// IMAGE STORAGE
// ============================================================

export const ImageStorage = {
  // ==========================================================
  // UPLOAD IMAGE
  // ==========================================================

  async uploadImage(fileBuffer, options = {}) {
    if (!Buffer.isBuffer(fileBuffer)) {
      throw new Error("IMAGE_BUFFER_REQUIRED");
    }

    const { folder = "categories" } = options;

    // upload.middleware.js has already refused anything that is not one
    // of these, so a null here is a caller that skipped it.
    const contentType = detectImageType(fileBuffer);
    const key = `${folder}/${randomUUID()}.${IMAGE_EXTENSIONS[contentType] ?? "bin"}`;

    try {
      if (!contentType) throw new Error("Unrecognised image type");

      await putObject(key, fileBuffer, contentType);

      const imageUrl = publicUrlFor(key);

      logger.info("Image uploaded to R2 successfully", { key, imageUrl });

      return {
        imageUrl,
        imagePublicId: key,
      };
    } catch (error) {
      logger.error("R2 image upload failed", {
        folder,
        key,
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

  /**
   * Deleting a key that does not exist succeeds, as S3 does. That covers
   * the rows still holding a R2 object key — images the migration
   * could not copy because their source was already gone — so removing
   * one of those is a harmless no-op here rather than an error.
   */
  async deleteImage(publicId) {
    if (!publicId) {
      return null;
    }

    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: env.r2.bucket, Key: publicId }),
      );

      logger.info("Image deleted from R2 successfully", { key: publicId });

      return { result: "ok" };
    } catch (error) {
      logger.error("R2 image deletion failed", {
        key: publicId,
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
