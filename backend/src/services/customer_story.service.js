// src/services/customer_story.service.js
//
// What customers have sent the shop (F-06.08).
//
// Two ways in, because the shop has two habits. Most of the time it
// drops a set of photographs in and types nothing: `createFromImages`.
// Occasionally what is worth publishing is a sentence somebody wrote
// with no picture attached: `createFromText`. Both land at the front of
// the order, and everything after that — naming the customer, quoting
// them, pointing the card at a piece — is an edit.
//
// The rule the whole file protects is the one in 018: a story is a
// picture, or some words, or both, and never neither. It is a CHECK in
// the database and a check in `update` here, because the database can
// only refuse the row — it cannot say "clearing the quote would leave
// this story with nothing on it, and it has no photograph".
//
// The Cloudinary ordering rules are banner.service.js's, for the same
// reasons: upload before insert, upload before delete when replacing,
// row before file when deleting. Never leave a row pointing at a file
// that is not there.

import { CustomerStoryRepository } from "../repository/customer_story.repository.js";
import { CustomerStoryMapper } from "../mapper/customer_story.mapper.js";
import { CloudinaryStorage } from "../config/cloudinary.cdn.js";
import { MAX_STORIES, STORY_FOLDER } from "../config/customer_story.policy.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const assertUuid = (value, label = "story ID") => {
  const id = String(value ?? "").trim();

  if (!UUID_RE.test(id)) {
    throw ApiError.badRequest(`Invalid ${label}`, "INVALID_UUID");
  }

  return id;
};

/**
 * The foreign key on `product_id`, reached by an id that names nothing.
 *
 * Turned into a sentence about a piece rather than left as 23503, which
 * reaches the shop as "something went wrong" after it has picked a
 * product from a list that had gone stale.
 */
const asProductError = (error) => {
  if (error?.code === "23503") {
    return ApiError.badRequest(
      "That piece is not in the catalogue. It may have been deleted since this screen loaded.",
      "STORY_PRODUCT_NOT_FOUND",
    );
  }

  return null;
};

/** Best effort tidy-up of uploads this request is no longer going to use. */
const discardUploads = async (uploaded, reason) => {
  if (!uploaded.length) return;

  logger.warn("Discarding story uploads after a failure", {
    reason,
    publicIds: uploaded.map((image) => image.imagePublicId),
  });

  await Promise.all(
    uploaded.map((image) =>
      CloudinaryStorage.deleteImage(image.imagePublicId).catch((error) => {
        logger.error("Orphaned story image left on Cloudinary", {
          publicId: image.imagePublicId,
          error: error?.message,
        });
      }),
    ),
  );
};

/** How much room is left, phrased for the shop rather than as a number. */
const assertRoom = async (wanted) => {
  const existing = await CustomerStoryRepository.count();

  if (existing + wanted <= MAX_STORIES) return;

  const room = Math.max(0, MAX_STORIES - existing);

  throw ApiError.conflict(
    room === 0
      ? `There are already ${MAX_STORIES} stories, which is the most this screen holds. Delete one before adding another.`
      : `There is room for ${room} more story${room === 1 ? "" : "s"} — ${MAX_STORIES} is the most this screen holds.`,
    "STORY_LIMIT_REACHED",
  );
};

export const CustomerStoryService = {
  // ==========================================================
  // READS
  // ==========================================================

  /** Every story, published or not — the admin screen's list. */
  async getAll() {
    try {
      const rows = await CustomerStoryRepository.list();

      return CustomerStoryMapper.toDTOList(rows);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("CustomerStoryService.getAll failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to load the customer stories");
    }
  },

  async getById(storyId) {
    const id = assertUuid(storyId);

    try {
      const row = await CustomerStoryRepository.findById(id);

      if (!row) {
        throw ApiError.notFound("Story not found", "STORY_NOT_FOUND");
      }

      return CustomerStoryMapper.toDTO(row);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("CustomerStoryService.getById failed", {
        storyId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to load the story");
    }
  },

  // ==========================================================
  // WRITES
  // ==========================================================

  /**
   * The common gesture: a batch of photographs, one story each.
   *
   * Nothing is typed. Each file becomes a card with a picture and no
   * name and no quote, at the front of the order, published — which is
   * what the shop wants nine times out of ten, and the rest is an edit
   * on the few cards that need one.
   *
   * The uploads run together, and `allSettled` is what makes that safe:
   * if the fourth fails, the three that succeeded have to be found and
   * deleted, and `Promise.all` would have thrown their public ids away
   * with the pending promises.
   */
  async createFromImages(files) {
    await assertRoom(files.length);

    const results = await Promise.allSettled(
      files.map((file) =>
        CloudinaryStorage.uploadImage(file.buffer, { folder: STORY_FOLDER }),
      ),
    );

    const uploaded = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);

    const failed = results.filter((result) => result.status === "rejected");

    // One bad file rejects the whole batch, matching how the magic-byte
    // check upstream treats a bad image. A partial upload would leave
    // the shop comparing the screen against the files it picked.
    if (failed.length) {
      await discardUploads(uploaded, "one or more uploads failed");

      logger.error("Story upload failed", {
        requested: files.length,
        failed: failed.length,
        error: failed[0]?.reason?.message,
      });

      throw new ApiError(
        502,
        failed.length === files.length
          ? "The photographs could not be uploaded. Please try again."
          : `${failed.length} of ${files.length} photographs could not be uploaded, so none were saved. Please try again.`,
      );
    }

    try {
      const rows = await CustomerStoryRepository.createManyAtFront(
        uploaded.map((image) => ({
          image: image.imageUrl,
          imagePublicId: image.imagePublicId,
        })),
      );

      logger.info("Customer stories created from images", {
        count: uploaded.length,
      });

      return CustomerStoryMapper.toDTOList(rows);
    } catch (error) {
      await discardUploads(uploaded, "the stories could not be saved");

      logger.error("CustomerStoryService.createFromImages failed", {
        count: uploaded.length,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to save the stories");
    }
  },

  /**
   * A story that is words rather than a picture.
   *
   * The validator has already insisted on a quote, which is what stops
   * this creating an empty row.
   */
  async createFromText(fields) {
    await assertRoom(1);

    try {
      const rows = await CustomerStoryRepository.createManyAtFront([
        {
          customerName: fields.customerName,
          body: fields.body,
          productId: fields.productId,
        },
      ]);

      logger.info("Customer story created from text");

      return CustomerStoryMapper.toDTOList(rows);
    } catch (error) {
      const productError = asProductError(error);
      if (productError) throw productError;

      logger.error("CustomerStoryService.createFromText failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to save the story");
    }
  },

  /**
   * Replaces a story's typed fields.
   *
   * The content rule is checked here rather than left to the CHECK in
   * 018, because only this layer can see both halves of it. Clearing the
   * quote on a story that has a photograph is fine; doing it on one that
   * does not would leave a card with nothing on it, and the database can
   * only answer that with a constraint name.
   */
  async update(storyId, fields) {
    const id = assertUuid(storyId);

    const existing = await CustomerStoryRepository.findById(id);

    if (!existing) {
      throw ApiError.notFound("Story not found", "STORY_NOT_FOUND");
    }

    if (!existing.image && !fields.body) {
      throw ApiError.badRequest(
        "This story has no photograph, so it needs a quote. Add one, or delete the story.",
        "STORY_WOULD_BE_EMPTY",
      );
    }

    try {
      const row = await CustomerStoryRepository.updateFields(id, fields);

      if (!row) {
        throw ApiError.notFound("Story not found", "STORY_NOT_FOUND");
      }

      logger.info("Customer story updated", { id });

      return CustomerStoryMapper.toDTO(row);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      const productError = asProductError(error);
      if (productError) throw productError;

      logger.error("CustomerStoryService.update failed", {
        storyId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update the story");
    }
  },

  /**
   * Swaps a story's photograph, or gives one to a story that was words
   * alone.
   *
   * The old file is deleted only once the row points at the new one —
   * see banner.service.js, which explains why Cloudinary's own
   * `replaceImage` is the wrong way round for this.
   */
  async replaceImage(storyId, file) {
    const id = assertUuid(storyId);

    const existing = await CustomerStoryRepository.findById(id);

    if (!existing) {
      throw ApiError.notFound("Story not found", "STORY_NOT_FOUND");
    }

    let uploaded;

    try {
      uploaded = await CloudinaryStorage.uploadImage(file.buffer, {
        folder: STORY_FOLDER,
      });
    } catch (error) {
      logger.error("Story image upload failed", {
        storyId: id,
        error: error?.message,
      });

      throw new ApiError(
        502,
        "The photograph could not be uploaded. Please try again.",
      );
    }

    let row;

    try {
      row = await CustomerStoryRepository.replaceImage(id, uploaded);
    } catch (error) {
      await discardUploads([uploaded], "the story could not be updated");

      logger.error("CustomerStoryService.replaceImage failed", {
        storyId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update the story");
    }

    // Deleted by another admin between the two reads. The upload is
    // discarded and the caller is told the story is gone, rather than
    // being handed a 500 for a race with a legitimate action.
    if (!row) {
      await discardUploads([uploaded], "the story was deleted mid-request");

      throw ApiError.notFound("Story not found", "STORY_NOT_FOUND");
    }

    // The row is safe. Losing the old file now costs storage and
    // nothing else — and there may be no old file at all, if this story
    // was words until a moment ago.
    if (existing.image_public_id) {
      CloudinaryStorage.deleteImage(existing.image_public_id).catch((error) => {
        logger.error("Replaced story image left on Cloudinary", {
          storyId: id,
          publicId: existing.image_public_id,
          error: error?.message,
        });
      });
    }

    logger.info("Customer story image replaced", { storyId: id });

    return CustomerStoryMapper.toDTO(row);
  },

  /** Takes a story off the home page, or puts it back. */
  async setPublished(storyId, published) {
    const id = assertUuid(storyId);

    try {
      const row = await CustomerStoryRepository.setPublished(
        id,
        Boolean(published),
      );

      if (!row) {
        throw ApiError.notFound("Story not found", "STORY_NOT_FOUND");
      }

      logger.info("Customer story visibility changed", {
        id,
        published: row.published,
      });

      return CustomerStoryMapper.toDTO(row);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("CustomerStoryService.setPublished failed", {
        storyId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update the story");
    }
  },

  /**
   * Rewrites the order the cards are shown in.
   *
   * The whole set must be sent, for the reason the size charts and the
   * banners both give: a partial list renumbers what it names from 1 and
   * leaves the rest sharing positions with them, which is not a reorder.
   */
  async reorder(ids) {
    try {
      const existing = await CustomerStoryRepository.list();
      const known = new Set(existing.map((row) => row.id));

      if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
        throw ApiError.badRequest(
          "Send every story, in the order they should be shown. " +
            "The list has changed since this screen loaded.",
          "STORY_ORDER_INCOMPLETE",
        );
      }

      const rows = await CustomerStoryRepository.reorder(ids);

      logger.info("Customer stories reordered", { count: ids.length });

      return CustomerStoryMapper.toDTOList(rows);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("CustomerStoryService.reorder failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to reorder the stories");
    }
  },

  /**
   * Deletes a story outright, and the photograph behind it.
   *
   * There is no undo, and a customer's photograph is not something the
   * shop can ask for twice. Hiding is what `setPublished` is for, and it
   * is the gesture the admin screen offers first.
   */
  async remove(storyId) {
    const id = assertUuid(storyId);

    let removed;

    try {
      removed = await CustomerStoryRepository.remove(id);
    } catch (error) {
      logger.error("CustomerStoryService.remove failed", {
        storyId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to delete the story");
    }

    if (!removed) {
      throw ApiError.notFound("Story not found", "STORY_NOT_FOUND");
    }

    // The row is gone, so the admin's action has succeeded whatever
    // happens next. A file left behind costs storage and is findable
    // from this log line.
    if (removed.image_public_id) {
      CloudinaryStorage.deleteImage(removed.image_public_id).catch((error) => {
        logger.error("Deleted story's image left on Cloudinary", {
          storyId: id,
          publicId: removed.image_public_id,
          error: error?.message,
        });
      });
    }

    logger.info("Customer story deleted", { id });

    return CustomerStoryService.getAll();
  },
};
