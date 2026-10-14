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

// ============================================================
// CACHE LIFETIME
// ============================================================
//
// Every key is new — a random name, never reused — so a URL always
// points at the same bytes, and *staleness* is never the risk: nothing
// is ever overwritten in place. The risk is the other direction. A year
// of `immutable` told Cloudflare's edge and every browser to keep an
// object for a year without asking again, so a deleted image went on
// being served from the edge long after R2 had forgotten it. For a
// product photo that is harmless. For a customer story it is not: those
// are photographs of real customers, and "please take my picture down"
// has to mean down, not "gone from the page but still at its URL for
// eleven months". There is no Cloudflare purge credential by default
// (see purgeFromEdge below), so the header is the only lever there is.
//
// So the lifetime follows the folder, i.e. what the object is:
//
//   products/    a year, immutable. Unique keys, never deleted for
//                privacy, and the bulk of the traffic — the catalogue
//                is what the CDN exists to serve.
//   stories/     a minute. Personal photographs; removal must take
//                effect almost at once.
//   banners/,    five minutes. Removed for content reasons — a sale
//   categories/  that ended, artwork that was wrong — and nobody minds
//                the edge asking R2 again every few minutes.
//   anything     five minutes. Unknown is treated as removable.
//   else
//
// The header is written onto the object at upload, so this governs new
// uploads only. Objects already in the bucket keep the year they were
// written with until they are replaced or their metadata is rewritten.

const LONG_LIVED = "public, max-age=31536000, immutable";

const CACHE_CONTROL_BY_FOLDER = {
  products: LONG_LIVED,
  stories: "public, max-age=60",
  banners: "public, max-age=300",
  categories: "public, max-age=300",
};

const DEFAULT_CACHE_CONTROL = "public, max-age=300";

/** The Cache-Control an object under `key` is written with. */
export const cacheControlFor = (key) => {
  const folder = String(key ?? "").split("/")[0];
  return CACHE_CONTROL_BY_FOLDER[folder] ?? DEFAULT_CACHE_CONTROL;
};

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
      CacheControl: cacheControlFor(key),
    }),
  );

// ============================================================
// EDGE PURGE (OPTIONAL)
// ============================================================

/**
 * Asks Cloudflare to drop one URL from its edge cache. Best-effort.
 *
 * Only when CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN are both set —
 * the zone is the one R2_PUBLIC_URL's domain lives in, and the token
 * needs nothing but Zone → Cache Purge. Without them this does nothing
 * and the short lifetimes above are what bound how long a deleted
 * image lingers.
 *
 * Read from process.env directly rather than through env.js because it
 * is optional, read in exactly one place, and its absence is the normal
 * case.
 *
 * Never throws and never fails the delete: the object is already gone
 * from R2 by the time this runs, and refusing to report that because a
 * cache API was slow would leave the row pointing at nothing. Browsers
 * that already hold the image keep it for its max-age regardless —
 * no purge reaches them.
 */
const purgeFromEdge = async (key) => {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();

  if (!zoneId || !token) return;

  const url = publicUrlFor(key);

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ files: [url] }),
        signal: AbortSignal.timeout(5_000),
      },
    );

    if (!response.ok) {
      logger.warn("Cloudflare cache purge was refused", {
        key,
        status: response.status,
      });
      return;
    }

    logger.info("Image purged from the Cloudflare edge", { key });
  } catch (error) {
    logger.warn("Cloudflare cache purge failed", { key, error: error?.message });
  }
};

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

    // Outside the try: the delete has succeeded, and purgeFromEdge
    // swallows its own failures.
    await purgeFromEdge(publicId);

    return { result: "ok" };
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
