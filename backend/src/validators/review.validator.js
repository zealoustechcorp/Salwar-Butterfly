// src/validators/review.validator.js
//
// Shape checks only. The lengths, the star range and the difference
// between "leave this alone" and "clear it" are enforced in
// ReviewService, so a review written through any path is written the
// same way.

import { ApiError } from "../utils/ApiError.js";
import {
  MAX_AUTHOR_LENGTH,
  MAX_BODY_LENGTH,
  MAX_PAGE_SIZE,
  MAX_RATING,
  MAX_TITLE_LENGTH,
  MIN_RATING,
  REVIEW_SORTS,
} from "../config/review.policy.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value) => UUID_REGEX.test(String(value ?? "").trim());

const isStars = (value) => {
  const rating = Number(value);
  return Number.isInteger(rating) && rating >= MIN_RATING && rating <= MAX_RATING;
};

/** "true", "false" and "all" — what a tri-state filter arrives as. */
const isTriState = (value) =>
  value === "true" || value === "false" || value === "all" || value === "";

export const validateReviewQuery = (req, res, next) => {
  try {
    const { productId, rating, published, sort, page, limit } = req.query ?? {};

    const errors = {};

    if (productId !== undefined && !isUuid(productId)) {
      errors.productId = "Invalid product ID format";
    }

    if (rating !== undefined && !isStars(rating)) {
      errors.rating = `Rating must be a whole number between ${MIN_RATING} and ${MAX_RATING}`;
    }

    if (published !== undefined && !isTriState(published)) {
      errors.published = "Published must be true, false, or all";
    }

    if (sort !== undefined && !REVIEW_SORTS.includes(sort)) {
      errors.sort = `Unknown sort. Expected one of: ${REVIEW_SORTS.join(", ")}.`;
    }

    if (page !== undefined && (!Number.isInteger(Number(page)) || Number(page) < 1)) {
      errors.page = "Page must be a positive whole number";
    }

    if (limit !== undefined) {
      const value = Number(limit);

      if (!Number.isInteger(value) || value < 1) {
        errors.limit = "Limit must be a positive whole number";
      } else if (value > MAX_PAGE_SIZE) {
        errors.limit = `Limit cannot exceed ${MAX_PAGE_SIZE}`;
      }
    }

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const validateReviewIdParam = (req, res, next) => {
  try {
    const id = req.params?.id;

    if (!isUuid(id)) {
      throw new ApiError(400, "Invalid review ID format");
    }

    req.params.id = String(id).trim();
    next();
  } catch (error) {
    next(error);
  }
};

export const validateCreateReview = (req, res, next) => {
  try {
    const { productId, customerId, authorName, rating, title, body, published } =
      req.body ?? {};

    const errors = {};

    if (!isUuid(productId)) {
      errors.productId = "A product must be chosen";
    }

    // Optional, but a value that is present has to be a real id — an
    // unparseable one would otherwise reach the database and come back
    // as a 500 rather than as this sentence.
    if (customerId !== undefined && customerId !== null && !isUuid(customerId)) {
      errors.customerId = "Invalid customer ID format";
    }

    const author = String(authorName ?? "").trim();

    if (!author) {
      errors.authorName = "A name to publish the review under is required";
    } else if (author.length > MAX_AUTHOR_LENGTH) {
      errors.authorName = `Name cannot exceed ${MAX_AUTHOR_LENGTH} characters`;
    }

    if (!isStars(rating)) {
      errors.rating = `Rating must be a whole number between ${MIN_RATING} and ${MAX_RATING}`;
    }

    if (title !== undefined && title !== null && String(title).length > MAX_TITLE_LENGTH) {
      errors.title = `Title cannot exceed ${MAX_TITLE_LENGTH} characters`;
    }

    if (body !== undefined && body !== null && String(body).length > MAX_BODY_LENGTH) {
      errors.body = `Review cannot exceed ${MAX_BODY_LENGTH} characters`;
    }

    if (published !== undefined && typeof published !== "boolean") {
      errors.published = "Published must be true or false";
    }

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * A partial update.
 *
 * Every field is optional, so the only thing worth refusing outright is
 * a body with nothing in it — a PUT that changes nothing is a mistake
 * in the caller, and answering 200 to it hides that.
 *
 * Note what is *not* rejected: `title: ""`. That is how the screen says
 * "take the title off", and the service reads it as such.
 */
export const validateUpdateReview = (req, res, next) => {
  try {
    const { customerId, authorName, rating, title, body, published } =
      req.body ?? {};

    const errors = {};

    const provided = [
      customerId,
      authorName,
      rating,
      title,
      body,
      published,
    ].some((value) => value !== undefined);

    if (!provided) {
      throw new ApiError(400, "Validation failed", {
        review: "Nothing to update",
      });
    }

    if (customerId !== undefined && customerId !== null && !isUuid(customerId)) {
      errors.customerId = "Invalid customer ID format";
    }

    if (authorName !== undefined) {
      const author = String(authorName ?? "").trim();

      if (!author) {
        errors.authorName = "A name to publish the review under is required";
      } else if (author.length > MAX_AUTHOR_LENGTH) {
        errors.authorName = `Name cannot exceed ${MAX_AUTHOR_LENGTH} characters`;
      }
    }

    if (rating !== undefined && !isStars(rating)) {
      errors.rating = `Rating must be a whole number between ${MIN_RATING} and ${MAX_RATING}`;
    }

    if (title !== undefined && title !== null && String(title).length > MAX_TITLE_LENGTH) {
      errors.title = `Title cannot exceed ${MAX_TITLE_LENGTH} characters`;
    }

    if (body !== undefined && body !== null && String(body).length > MAX_BODY_LENGTH) {
      errors.body = `Review cannot exceed ${MAX_BODY_LENGTH} characters`;
    }

    if (published !== undefined && typeof published !== "boolean") {
      errors.published = "Published must be true or false";
    }

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const validateSetPublished = (req, res, next) => {
  try {
    const { published } = req.body ?? {};

    if (typeof published !== "boolean") {
      throw new ApiError(400, "Validation failed", {
        published: "Published must be true or false",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};
