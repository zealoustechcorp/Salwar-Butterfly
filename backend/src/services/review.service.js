// src/services/review.service.js
//
// Reviews and ratings (F-11.06).
//
// The admin is the only author, so there is no moderation state machine
// here and no ownership check — the two things that make a review
// service complicated in a marketplace. What is left is the shape of
// the data and one editing decision worth naming: how a field is
// cleared.
//
// A PUT that omits `title` means "leave it alone". A PUT that sends
// `title: ""` means "take it off". Those are different intentions and
// the repository's COALESCE can only express the first, so the second
// is separated out here and applied as its own write. Collapsing them
// — treating an absent field as a clear — would empty a review's body
// every time a screen patched only its rating.

import { ReviewRepository } from "../repository/review.repository.js";
import { ReviewMapper } from "../mapper/review.mapper.js";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  MAX_AUTHOR_LENGTH,
  MAX_BODY_LENGTH,
  MAX_PAGE_SIZE,
  MAX_RATING,
  MAX_SEARCH_LENGTH,
  MAX_TITLE_LENGTH,
  MIN_RATING,
  REVIEW_SORTS,
} from "../config/review.policy.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const assertUuid = (value, label) => {
  const normalized = String(value ?? "").trim();
  if (!normalized || !UUID_REGEX.test(normalized)) {
    throw new ApiError(400, `Invalid ${label}`);
  }
  return normalized;
};

const normalizeRating = (value) => {
  if (value === undefined || value === null || value === "") {
    throw new ApiError(400, "A rating is required");
  }

  const rating = Number(value);

  if (!Number.isInteger(rating)) {
    throw new ApiError(400, "Rating must be a whole number of stars");
  }

  if (rating < MIN_RATING || rating > MAX_RATING) {
    throw new ApiError(
      400,
      `Rating must be between ${MIN_RATING} and ${MAX_RATING} stars`,
    );
  }

  return rating;
};

const normalizeAuthor = (value) => {
  const author = String(value ?? "").trim();

  if (!author) {
    throw new ApiError(400, "A name to publish the review under is required");
  }

  if (author.length > MAX_AUTHOR_LENGTH) {
    throw new ApiError(
      400,
      `That name is longer than the ${MAX_AUTHOR_LENGTH} characters a review can carry`,
    );
  }

  return author;
};

/**
 * Trims optional prose, and distinguishes the three states it can be
 * in.
 *
 * @returns {string|null|undefined} the text, `null` to clear it, or
 *          `undefined` to leave it untouched
 */
const normalizeText = (value, label, maxLength) => {
  if (value === undefined) return undefined;

  if (value === null) return null;

  const text = String(value).trim();

  // An empty string is an instruction, not an empty value: the admin
  // selected the field's contents and deleted them.
  if (!text) return null;

  if (text.length > maxLength) {
    throw new ApiError(
      400,
      `${label} is longer than the ${maxLength} characters a review can carry`,
    );
  }

  return text;
};

const normalizeSearch = (value) => {
  const search = String(value ?? "").trim();
  return search ? search.slice(0, MAX_SEARCH_LENGTH) : null;
};

/**
 * A tri-state boolean off a query string.
 *
 * `undefined` and the empty string mean "either"; everything else has
 * to be one of the two words, because a filter that silently reads an
 * unrecognised value as `false` hides rows without saying so.
 */
const normalizeTriStateBoolean = (value, label) => {
  if (value === undefined || value === null || value === "" || value === "all") {
    return null;
  }

  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;

  throw new ApiError(400, `${label} must be true or false`);
};

/** Turns a repository code into the sentence for it. */
const translate = (error) => {
  if (error?.code === "PRODUCT_NOT_FOUND") {
    return new ApiError(404, "That product no longer exists");
  }

  if (error?.code === "CUSTOMER_NOT_FOUND") {
    return new ApiError(404, "That customer no longer exists");
  }

  if (error?.code === "RATING_OUT_OF_RANGE") {
    return new ApiError(
      400,
      `Rating must be between ${MIN_RATING} and ${MAX_RATING} stars`,
    );
  }

  return null;
};

export const ReviewService = {
  // ==========================================================
  // READ
  // ==========================================================

  /**
   * A page of reviews, with the scores beside it.
   *
   * The summary is fetched alongside rather than derived from the page,
   * for the reason the inventory tiles are: a page is twenty-five rows
   * and the average describes all of them.
   *
   * It follows the product filter but not the others. "This product
   * averages 4.3" is a fact about the product; recomputing it under a
   * `rating=5` filter would return 5.0, which is true of the filter and
   * meaningless as a rating.
   */
  async listReviews({
    productId = null,
    rating = null,
    published = null,
    search = null,
    sort = DEFAULT_SORT,
    page = 1,
    limit = DEFAULT_PAGE_SIZE,
  } = {}) {
    try {
      if (sort && !REVIEW_SORTS.includes(sort)) {
        throw new ApiError(
          400,
          `Unknown sort "${sort}". Expected one of: ${REVIEW_SORTS.join(", ")}.`,
        );
      }

      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.min(
        Math.max(Number(limit) || DEFAULT_PAGE_SIZE, 1),
        MAX_PAGE_SIZE,
      );

      const product = productId ? assertUuid(productId, "product ID") : null;

      const filters = {
        productId: product,
        rating: rating ? normalizeRating(rating) : null,
        published: normalizeTriStateBoolean(published, "Published"),
        search: normalizeSearch(search),
        sort: sort || DEFAULT_SORT,
        page: safePage,
        limit: safeLimit,
      };

      const [result, summaryRow] = await Promise.all([
        ReviewRepository.findAll(filters),
        ReviewRepository.ratingSummary({ productId: product }),
      ]);

      const totalPages =
        result.total === 0 ? 0 : Math.ceil(result.total / safeLimit);

      logger.info("Reviews fetched", {
        productId: product,
        returned: result.rows.length,
        total: result.total,
      });

      return {
        data: ReviewMapper.toDTOList(result.rows),
        summary: ReviewMapper.toRatingSummary(summaryRow),
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

      logger.error("ReviewService.listReviews failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch reviews");
    }
  },

  async getReviewById(id) {
    try {
      const review = await ReviewRepository.findById(assertUuid(id, "review ID"));

      if (!review) throw new ApiError(404, "Review not found");

      return ReviewMapper.toDTO(review);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ReviewService.getReviewById failed", {
        reviewId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch the review");
    }
  },

  /** The scores on their own — for a product screen with no list. */
  async getRatingSummary({ productId = null } = {}) {
    try {
      const row = await ReviewRepository.ratingSummary({
        productId: productId ? assertUuid(productId, "product ID") : null,
      });

      return ReviewMapper.toRatingSummary(row);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ReviewService.getRatingSummary failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch the rating summary");
    }
  },

  // ==========================================================
  // WRITE
  // ==========================================================

  async createReview(input = {}) {
    try {
      const review = await ReviewRepository.create({
        productId: assertUuid(input.productId, "product ID"),

        // Optional, and null is a perfectly ordinary value here: most
        // reviews the shop publishes came from a phone call.
        customerId: input.customerId
          ? assertUuid(input.customerId, "customer ID")
          : null,

        authorName: normalizeAuthor(input.authorName),
        rating: normalizeRating(input.rating),
        title: normalizeText(input.title, "Title", MAX_TITLE_LENGTH) ?? null,
        body: normalizeText(input.body, "Review", MAX_BODY_LENGTH) ?? null,

        // Published unless the admin says otherwise. The screen's
        // default is to publish, and a review saved as a draft by
        // accident is one nobody ever notices is missing.
        published: input.published === undefined ? true : input.published !== false,
      });

      logger.info("Review created", { reviewId: review?.id });

      return ReviewMapper.toDTO(review);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      const translated = translate(error);
      if (translated) throw translated;

      logger.error("ReviewService.createReview failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to save the review");
    }
  },

  /**
   * A partial update.
   *
   * Two writes where the caller cleared a field, because COALESCE
   * cannot set a column back to NULL. Not a transaction: both touch one
   * row, the second only ever nulls what the first left alone, and the
   * worst interleaving leaves a review with its new rating and its old
   * body — visibly wrong on the screen that just saved it, and fixed by
   * saving again. A transaction to protect against that would be
   * ceremony.
   */
  async updateReview(id, input = {}) {
    try {
      const reviewId = assertUuid(id, "review ID");

      const title = normalizeText(input.title, "Title", MAX_TITLE_LENGTH);
      const body = normalizeText(input.body, "Review", MAX_BODY_LENGTH);

      const updated = await ReviewRepository.update(reviewId, {
        customerId: input.customerId
          ? assertUuid(input.customerId, "customer ID")
          : undefined,

        authorName:
          input.authorName === undefined
            ? undefined
            : normalizeAuthor(input.authorName),

        rating:
          input.rating === undefined ? undefined : normalizeRating(input.rating),

        // `null` here means "clear", which COALESCE reads as "leave
        // alone" — so the value is withheld from this write and applied
        // by the one below.
        title: title === null ? undefined : title,
        body: body === null ? undefined : body,

        published:
          input.published === undefined ? undefined : input.published !== false,
      });

      if (!updated) throw new ApiError(404, "Review not found");

      const toClear = [
        title === null ? "title" : null,
        body === null ? "body" : null,

        // An explicit null detaches the account, which is the only way
        // to undo having attached the wrong one.
        input.customerId === null ? "customer_id" : null,
      ].filter(Boolean);

      const review = toClear.length
        ? await ReviewRepository.clearColumns(reviewId, toClear)
        : updated;

      logger.info("Review updated", { reviewId, cleared: toClear });

      return ReviewMapper.toDTO(review);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      const translated = translate(error);
      if (translated) throw translated;

      logger.error("ReviewService.updateReview failed", {
        reviewId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update the review");
    }
  },

  /**
   * Takes a review off the storefront, or puts it back.
   *
   * Its own method rather than a call to `updateReview`, because it is
   * its own gesture on the screen — a toggle in a row, not a form — and
   * routing it through the editor would mean sending a whole review to
   * change one boolean.
   */
  async setPublished(id, published) {
    try {
      const reviewId = assertUuid(id, "review ID");

      if (typeof published !== "boolean") {
        throw new ApiError(400, "Published must be true or false");
      }

      const review = await ReviewRepository.update(reviewId, { published });

      if (!review) throw new ApiError(404, "Review not found");

      logger.info("Review visibility changed", { reviewId, published });

      return ReviewMapper.toDTO(review);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ReviewService.setPublished failed", {
        reviewId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update the review");
    }
  },

  async deleteReview(id) {
    try {
      const reviewId = assertUuid(id, "review ID");

      const removed = await ReviewRepository.remove(reviewId);

      if (!removed) throw new ApiError(404, "Review not found");

      logger.info("Review deleted", { reviewId });

      return { id: reviewId };
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ReviewService.deleteReview failed", {
        reviewId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to delete the review");
    }
  },
};
