// src/services/home_section.service.js
//
// The hand-picked shelves on the home page (F-06): "Best sellers",
// festival sales, and any other collection the shop wants to put in front
// of shoppers.
//
// No files are involved, so unlike banners and stories there is no
// upload-then-insert ordering to protect. What this layer adds over the
// repository is the ceiling on how many shelves exist, a complete-set
// check on reorder, and sentences in place of two database errors: a slug
// another shelf already uses (23505), and a picked product that has been
// deleted since the screen loaded (23503).

import { HomeSectionRepository } from "../repository/home_section.repository.js";
import { HomeSectionMapper } from "../mapper/home_section.mapper.js";
import { MAX_SECTIONS } from "../config/home_section.policy.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const assertUuid = (value) => {
  const id = String(value ?? "").trim();

  if (!UUID_RE.test(id)) {
    throw ApiError.badRequest("Invalid section ID", "INVALID_UUID");
  }

  return id;
};

const notFound = () =>
  ApiError.notFound("Section not found", "HOME_SECTION_NOT_FOUND");

/** The two database refusals a correct form can still run into. */
const asKnownError = (error, slug) => {
  if (error?.code === "23505" && error?.constraint === "uq_home_sections_slug") {
    return ApiError.conflict(
      `Another section already uses the link name "${slug}". Choose a different one.`,
      "HOME_SECTION_SLUG_TAKEN",
    );
  }

  if (error?.code === "23503") {
    return ApiError.badRequest(
      "One of the picked pieces is no longer in the catalogue. It may have been deleted since this screen loaded.",
      "HOME_SECTION_PRODUCT_NOT_FOUND",
    );
  }

  return null;
};

export const HomeSectionService = {
  // ==========================================================
  // READS
  // ==========================================================

  /** Every shelf, live or not, top first — the admin screen's list. */
  async getAll() {
    try {
      const rows = await HomeSectionRepository.list();

      return HomeSectionMapper.toDTOList(rows);
    } catch (error) {
      logger.error("HomeSectionService.getAll failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to load the home page sections");
    }
  },

  /** One shelf, with its picked pieces in order. */
  async getById(sectionId) {
    const id = assertUuid(sectionId);

    let row;

    try {
      row = await HomeSectionRepository.findById(id);
    } catch (error) {
      logger.error("HomeSectionService.getById failed", {
        sectionId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to load the section");
    }

    if (!row) throw notFound();

    return HomeSectionMapper.toDTO(row);
  },

  // ==========================================================
  // WRITES
  // ==========================================================

  /** Adds a shelf at the bottom of the stack. */
  async create(fields) {
    const existing = await HomeSectionRepository.count();

    if (existing >= MAX_SECTIONS) {
      throw ApiError.conflict(
        `There are already ${MAX_SECTIONS} sections, which is the most this screen holds. Delete an old one before adding another.`,
        "HOME_SECTION_LIMIT_REACHED",
      );
    }

    let id;

    try {
      id = await HomeSectionRepository.create(fields);
    } catch (error) {
      const known = asKnownError(error, fields.slug);
      if (known) throw known;

      logger.error("HomeSectionService.create failed", {
        slug: fields.slug,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to save the section");
    }

    logger.info("Home section created", {
      id,
      slug: fields.slug,
      products: fields.productIds.length,
    });

    return HomeSectionService.getById(id);
  },

  /** Replaces a shelf's fields and its picked pieces. */
  async update(sectionId, fields) {
    const id = assertUuid(sectionId);

    let found;

    try {
      found = await HomeSectionRepository.update(id, fields);
    } catch (error) {
      const known = asKnownError(error, fields.slug);
      if (known) throw known;

      logger.error("HomeSectionService.update failed", {
        sectionId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update the section");
    }

    if (!found) throw notFound();

    logger.info("Home section updated", {
      id,
      products: fields.productIds.length,
    });

    return HomeSectionService.getById(id);
  },

  /** Takes a shelf off the home page, or puts it back. */
  async setActive(sectionId, active) {
    const id = assertUuid(sectionId);

    let found;

    try {
      found = await HomeSectionRepository.setActive(id, Boolean(active));
    } catch (error) {
      logger.error("HomeSectionService.setActive failed", {
        sectionId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update the section");
    }

    if (!found) throw notFound();

    logger.info("Home section switched", { id, active: Boolean(active) });

    return HomeSectionService.getById(id);
  },

  /**
   * Rewrites the stacking order.
   *
   * The whole set must be sent: a partial list would renumber what it
   * names from 1 and leave the rest sharing positions with them.
   */
  async reorder(ids) {
    const existing = await HomeSectionService.getAll();
    const known = new Set(existing.map((section) => section.id));

    if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
      throw ApiError.badRequest(
        "Send every section, in the order they should be shown. " +
          "The list has changed since this screen loaded.",
        "HOME_SECTION_ORDER_INCOMPLETE",
      );
    }

    try {
      await HomeSectionRepository.reorder(ids);
    } catch (error) {
      logger.error("HomeSectionService.reorder failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to reorder the sections");
    }

    logger.info("Home sections reordered", { count: ids.length });

    return HomeSectionService.getAll();
  },

  /**
   * Deletes a shelf and its picks. The products themselves are untouched.
   * Switching a shelf off is the reversible gesture, and the one the admin
   * screen should offer first.
   */
  async remove(sectionId) {
    const id = assertUuid(sectionId);

    let removed;

    try {
      removed = await HomeSectionRepository.remove(id);
    } catch (error) {
      logger.error("HomeSectionService.remove failed", {
        sectionId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to delete the section");
    }

    if (!removed) throw notFound();

    logger.info("Home section deleted", { id });

    return HomeSectionService.getAll();
  },
};
