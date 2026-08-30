// src/validators/wishlist.validator.js
//
// Saved pieces (F-07). Shape checks only.

import { ApiError } from "../utils/ApiError.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The most ids one merge may offer.
 *
 * Higher than the wishlist cap in the service on purpose: this is the
 * size of the *request*, and the service is what decides how many of
 * them are kept. Rejecting the whole merge because a browser was holding
 * two hundred and one ids would lose the two hundred that were fine.
 */
const MAX_MERGE_IDS = 500;

export const validateWishlistProductIdParam = (req, res, next) => {
  const id = String(req.params?.productId ?? "").trim();

  if (!UUID_REGEX.test(id)) {
    throw new ApiError(400, "Invalid product ID format");
  }

  req.params.productId = id;

  next();
};

export const validateWishlistAdd = (req, res, next) => {
  const productId = String(req.body?.productId ?? "").trim();

  if (!UUID_REGEX.test(productId)) {
    throw new ApiError(400, "Validation failed", {
      productId: "A valid product ID is required",
    });
  }

  req.body.productId = productId;

  next();
};

/**
 * The sign-in merge (F-07).
 *
 * Only the shape is checked here — that it is an array of the right size
 * of things that are strings. Which of those ids name a product that
 * still exists is a question for the database, and the service drops the
 * ones that do not rather than failing the merge over them.
 */
export const validateWishlistMerge = (req, res, next) => {
  const { productIds } = req.body ?? {};

  if (!Array.isArray(productIds)) {
    throw new ApiError(400, "Validation failed", {
      productIds: "productIds must be an array",
    });
  }

  if (productIds.length > MAX_MERGE_IDS) {
    throw new ApiError(400, "Validation failed", {
      productIds: `No more than ${MAX_MERGE_IDS} ids may be merged at once`,
    });
  }

  if (productIds.some((id) => typeof id !== "string")) {
    throw new ApiError(400, "Validation failed", {
      productIds: "productIds must be an array of strings",
    });
  }

  next();
};
