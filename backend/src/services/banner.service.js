// src/services/banner.service.js
//
// The home page carousel (F-06).
//
// Everything here writes to two places at once — a row in Postgres and a
// file in R2 — and the order those two happen in is most of what
// this file has to say. There is no transaction spanning both, so each
// path picks the order whose failure mode is the cheap one:
//
//   creating   upload first, insert second. An insert that fails leaves
//              files nobody references, and this service deletes them on
//              the way out. The reverse would leave rows pointing at
//              images that do not exist, which renders as a broken
//              carousel on the shop's own front page.
//
//   replacing  upload, update, then delete the old file. A failure after
//              the upload leaves the slide showing what it showed
//              before, which is a state the shop can look at and retry.
//
//   deleting   row first, file second. An orphaned file costs storage
//              and is logged; the reverse is a live slide whose image
//              404s.
//
// The rule underneath all three: never leave a row pointing at a file
// that is not there. Everything else is recoverable.

import { BannerRepository } from "../repository/banner.repository.js";
import { BannerMapper } from "../mapper/banner.mapper.js";
import { ImageStorage } from "../config/r2.storage.js";
import { BANNER_FOLDER, MAX_BANNERS } from "../config/banner.policy.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const assertUuid = (value, label = "banner ID") => {
  const id = String(value ?? "").trim();

  if (!UUID_RE.test(id)) {
    throw ApiError.badRequest(`Invalid ${label}`, "INVALID_UUID");
  }

  return id;
};

/**
 * The foreign key on `product_id` (020), reached by an id that names
 * nothing.
 *
 * Turned into a sentence about a piece rather than left as 23503, which
 * reaches the shop as "something went wrong" after it has picked a
 * product from a list that had gone stale. Word for word the same
 * handler customer_story.service.js carries, for the same column shape.
 */
const asProductError = (error) => {
  if (error?.code === "23503") {
    return ApiError.badRequest(
      "That piece is not in the catalogue. It may have been deleted since this screen loaded.",
      "BANNER_PRODUCT_NOT_FOUND",
    );
  }

  return null;
};

/**
 * Deletes files this request uploaded and is no longer going to use.
 *
 * Best effort, and deliberately swallowing: it runs while another error
 * is already on its way to the admin, and a failure to tidy up must not
 * replace "the banners could not be saved" with an R2 message
 * about a file the shop never knew existed. What is lost is storage, and
 * the log line below is what makes it findable.
 */
const discardUploads = async (uploaded, reason) => {
  if (!uploaded.length) return;

  logger.warn("Discarding banner uploads after a failure", {
    reason,
    publicIds: uploaded.map((image) => image.imagePublicId),
  });

  await Promise.all(
    uploaded.map((image) =>
      ImageStorage.deleteImage(image.imagePublicId).catch((error) => {
        logger.error("Orphaned banner image left in R2", {
          publicId: image.imagePublicId,
          error: error?.message,
        });
      }),
    ),
  );
};

export const BannerService = {
  // ==========================================================
  // READS
  // ==========================================================

  /** Every banner, live or hidden — the admin screen's list. */
  async getAll() {
    try {
      const rows = await BannerRepository.list();

      return BannerMapper.toDTOList(rows);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("BannerService.getAll failed", { error: error?.message });

      throw new ApiError(500, "Failed to load the banners");
    }
  },

  async getById(bannerId) {
    const id = assertUuid(bannerId);

    try {
      const row = await BannerRepository.findById(id);

      if (!row) {
        throw ApiError.notFound("Banner not found", "BANNER_NOT_FOUND");
      }

      return BannerMapper.toDTO(row);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("BannerService.getById failed", {
        bannerId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to load the banner");
    }
  },

  // ==========================================================
  // WRITES
  // ==========================================================

  /**
   * Adds a batch of images to the end of the carousel.
   *
   * The ceiling is checked before anything is uploaded, so a shop that
   * is already at twelve is told so instead of paying to store four
   * files that are then deleted.
   *
   * The uploads run together rather than one after another — eight
   * round trips to R2 in sequence is a slow enough form
   * submission for an admin to wonder whether it worked — and
   * `allSettled` is what makes that safe: if the fourth fails, the three
   * that succeeded have to be found and deleted, and `Promise.all` would
   * have thrown away their public ids along with the pending promises.
   */
  async createMany(files) {
    const existing = await BannerRepository.count();

    if (existing + files.length > MAX_BANNERS) {
      const room = Math.max(0, MAX_BANNERS - existing);

      throw ApiError.conflict(
        room === 0
          ? `The carousel already holds ${MAX_BANNERS} banners, which is the most it can show. Delete one before adding another.`
          : `The carousel can hold ${MAX_BANNERS} banners and already has ${existing}. There is room for ${room} more.`,
        "BANNER_LIMIT_REACHED",
      );
    }

    const results = await Promise.allSettled(
      files.map((file) =>
        ImageStorage.uploadImage(file.buffer, { folder: BANNER_FOLDER }),
      ),
    );

    const uploaded = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);

    const failed = results.filter((result) => result.status === "rejected");

    // One bad file rejects the whole batch, matching how the magic-byte
    // check upstream treats a bad image. A partial upload would leave
    // the admin comparing the carousel against the files they selected
    // to work out which three of five landed.
    if (failed.length) {
      await discardUploads(uploaded, "one or more uploads failed");

      logger.error("Banner upload failed", {
        requested: files.length,
        failed: failed.length,
        error: failed[0]?.reason?.message,
      });

      throw new ApiError(
        502,
        failed.length === files.length
          ? "The images could not be uploaded. Please try again."
          : `${failed.length} of ${files.length} images could not be uploaded, so none were saved. Please try again.`,
      );
    }

    try {
      const rows = await BannerRepository.createMany(uploaded);

      logger.info("Banners created", {
        count: uploaded.length,
        publicIds: uploaded.map((image) => image.imagePublicId),
      });

      return BannerMapper.toDTOList(rows);
    } catch (error) {
      await discardUploads(uploaded, "the banners could not be saved");

      logger.error("BannerService.createMany failed", {
        count: uploaded.length,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to save the banners");
    }
  },

  /**
   * Swaps one slide's artwork, leaving it where it is in the order.
   *
   * The old file is deleted only once the row is pointing at the new
   * one. ImageStorage's own `replaceImage` deletes first and would leave
   * the shop with a slide pointing at nothing if the UPDATE then failed.
   */
  async replaceImage(bannerId, file) {
    const id = assertUuid(bannerId);

    const existing = await BannerRepository.findById(id);

    if (!existing) {
      throw ApiError.notFound("Banner not found", "BANNER_NOT_FOUND");
    }

    let uploaded;

    try {
      uploaded = await ImageStorage.uploadImage(file.buffer, {
        folder: BANNER_FOLDER,
      });
    } catch (error) {
      logger.error("Banner image upload failed", {
        bannerId: id,
        error: error?.message,
      });

      throw new ApiError(502, "The image could not be uploaded. Please try again.");
    }

    let row;

    try {
      row = await BannerRepository.replaceImage(id, uploaded);
    } catch (error) {
      await discardUploads([uploaded], "the banner could not be updated");

      logger.error("BannerService.replaceImage failed", {
        bannerId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update the banner");
    }

    // Deleted between the two checks by another admin. The upload is
    // discarded and the caller is told the banner is gone, rather than
    // being handed a 500 for what is a race with a legitimate action.
    if (!row) {
      await discardUploads([uploaded], "the banner was deleted mid-request");

      throw ApiError.notFound("Banner not found", "BANNER_NOT_FOUND");
    }

    // The row is safe. Losing the old file now costs storage and
    // nothing else, so a failure here is logged rather than raised —
    // the admin's edit succeeded, and telling them otherwise would
    // invite them to retry an upload that already worked.
    ImageStorage.deleteImage(existing.image_public_id).catch((error) => {
      logger.error("Replaced banner image left in R2", {
        bannerId: id,
        publicId: existing.image_public_id,
        error: error?.message,
      });
    });

    logger.info("Banner image replaced", {
      bannerId: id,
      publicId: uploaded.imagePublicId,
    });

    return BannerMapper.toDTO(row);
  },

  /** Takes a slide out of the rotation, or puts it back. */
  async setActive(bannerId, active) {
    const id = assertUuid(bannerId);

    try {
      const row = await BannerRepository.setActive(id, Boolean(active));

      if (!row) {
        throw ApiError.notFound("Banner not found", "BANNER_NOT_FOUND");
      }

      logger.info("Banner visibility changed", { id, active: row.active });

      return BannerMapper.toDTO(row);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("BannerService.setActive failed", {
        bannerId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update the banner");
    }
  },

  /**
   * Points a slide at a piece, or takes the link off it.
   *
   * Its own endpoint rather than part of a general update, for the same
   * reason `setActive` is: it is the only thing on the row an admin can
   * change without a file attached, and a shop correcting a link should
   * not have to re-upload artwork to do it.
   *
   * `null` is a real value, not a missing one — see the validator.
   *
   * @param {string|null} productId the piece, or null for no link
   */
  async setProduct(bannerId, productId) {
    const id = assertUuid(bannerId);

    try {
      const row = await BannerRepository.setProduct(id, productId ?? null);

      if (!row) {
        throw ApiError.notFound("Banner not found", "BANNER_NOT_FOUND");
      }

      logger.info("Banner product link changed", {
        id,
        productId: row.product_id ?? null,
      });

      return BannerMapper.toDTO(row);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      const productError = asProductError(error);
      if (productError) throw productError;

      logger.error("BannerService.setProduct failed", {
        bannerId: id,
        productId,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update the banner");
    }
  },

  /**
   * Rewrites the order the slides rotate in.
   *
   * The whole set must be sent. A partial list would renumber the
   * banners it names from 1 and leave the others where they were, which
   * is not a reorder — it is two slides at position 2 and an order that
   * settles by upload date. The ids are checked against what is actually
   * in the table, so a stale screen cannot half-apply an order built
   * before somebody else uploaded a batch.
   */
  async reorder(ids) {
    try {
      const existing = await BannerRepository.list();
      const known = new Set(existing.map((row) => row.id));

      if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
        throw ApiError.badRequest(
          "Send every banner, in the order they should rotate. " +
            "The carousel has changed since this screen loaded.",
          "BANNER_ORDER_INCOMPLETE",
        );
      }

      const rows = await BannerRepository.reorder(ids);

      logger.info("Banners reordered", { count: ids.length });

      return BannerMapper.toDTOList(rows);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("BannerService.reorder failed", { error: error?.message });

      throw new ApiError(500, "Failed to reorder the banners");
    }
  },

  /**
   * Deletes a banner outright, and the file behind it.
   *
   * There is no undo, and the R2 file goes with the row —
   * re-adding the banner means uploading the artwork again. Hiding is
   * what `setActive` is for, and it is the gesture the admin screen
   * offers first.
   */
  async remove(bannerId) {
    const id = assertUuid(bannerId);

    let removed;

    try {
      removed = await BannerRepository.remove(id);
    } catch (error) {
      logger.error("BannerService.remove failed", {
        bannerId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to delete the banner");
    }

    if (!removed) {
      throw ApiError.notFound("Banner not found", "BANNER_NOT_FOUND");
    }

    // The row is gone, so the admin's action has succeeded whatever
    // happens next. A file left behind costs storage and is findable
    // from this log line; raising here would report a failure for
    // something that did not fail.
    ImageStorage.deleteImage(removed.image_public_id).catch((error) => {
      logger.error("Deleted banner's image left in R2", {
        bannerId: id,
        publicId: removed.image_public_id,
        error: error?.message,
      });
    });

    logger.info("Banner deleted", {
      id,
      publicId: removed.image_public_id,
    });

    return BannerService.getAll();
  },
};
