// src/services/home_section.service.js
//
// The two home page sections (F-06): "Best sellers", and a custom section
// the shop renames for whatever is running — a Diwali sale, Pongal
// specials, a collection.
//
// Both are fixed (029). Nothing here creates, deletes or reorders a
// section; the shop changes a section's name, its description and its
// pieces, either from the section's own page or with the checkboxes on a
// product's page. What this layer adds over the repository is the ceiling
// on pieces per section, and a sentence in place of the database error for
// a picked product that has been deleted since the screen loaded (23503).

import { HomeSectionRepository } from "../repository/home_section.repository.js";
import { HomeSectionMapper } from "../mapper/home_section.mapper.js";
import { MAX_PRODUCTS_PER_SECTION } from "../config/home_section.policy.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const notFound = () =>
  ApiError.notFound("Section not found", "HOME_SECTION_NOT_FOUND");

const asProductError = (error) =>
  error?.code === "23503"
    ? ApiError.badRequest(
        "That piece is no longer in the catalogue. It may have been deleted since this screen loaded.",
        "HOME_SECTION_PRODUCT_NOT_FOUND",
      )
    : null;

export const HomeSectionService = {
  /** Both sections, Best sellers first, each with its picks. */
  async getAll() {
    try {
      return HomeSectionMapper.toDTOList(await HomeSectionRepository.list());
    } catch (error) {
      logger.error("HomeSectionService.getAll failed", { error: error?.message });
      throw new ApiError(500, "Failed to load the home page sections");
    }
  },

  async getBySlug(slug) {
    let row;

    try {
      row = await HomeSectionRepository.findBySlug(slug);
    } catch (error) {
      logger.error("HomeSectionService.getBySlug failed", { slug, error: error?.message });
      throw new ApiError(500, "Failed to load the section");
    }

    if (!row) throw notFound();

    return HomeSectionMapper.toDTO(row);
  },

  /** Replaces a section's name, description and pieces. */
  async update(slug, fields) {
    let found;

    try {
      found = await HomeSectionRepository.update(slug, fields);
    } catch (error) {
      const known = asProductError(error);
      if (known) throw known;

      logger.error("HomeSectionService.update failed", { slug, error: error?.message });
      throw new ApiError(500, "Failed to update the section");
    }

    if (!found) throw notFound();

    logger.info("Home section updated", { slug, products: fields.productIds.length });

    return HomeSectionService.getBySlug(slug);
  },

  /** Which sections one product is in, as slugs. */
  async getProductSections(productId) {
    try {
      return { sections: await HomeSectionRepository.sectionsForProduct(productId) };
    } catch (error) {
      logger.error("HomeSectionService.getProductSections failed", { productId, error: error?.message });
      throw new ApiError(500, "Failed to load the product's sections");
    }
  },

  /** The product page's checkboxes: put one product in exactly these sections. */
  async setProductSections(productId, slugs) {
    const [current, counts] = await Promise.all([
      HomeSectionRepository.sectionsForProduct(productId),
      HomeSectionRepository.counts(),
    ]);

    // Only a section the product is joining can grow past its limit.
    for (const slug of slugs) {
      if (!current.includes(slug) && (counts.get(slug) ?? 0) >= MAX_PRODUCTS_PER_SECTION) {
        throw ApiError.conflict(
          `That section already holds ${MAX_PRODUCTS_PER_SECTION} pieces, the most it can. Remove one from it first.`,
          "HOME_SECTION_FULL",
        );
      }
    }

    try {
      await HomeSectionRepository.setProductSections(productId, slugs);
    } catch (error) {
      const known = asProductError(error);
      if (known) throw known;

      logger.error("HomeSectionService.setProductSections failed", { productId, error: error?.message });
      throw new ApiError(500, "Failed to update the product's sections");
    }

    logger.info("Product home sections set", { productId, sections: slugs });

    return HomeSectionService.getProductSections(productId);
  },
};
