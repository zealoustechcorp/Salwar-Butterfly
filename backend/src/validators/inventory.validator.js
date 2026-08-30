// src/validators/inventory.validator.js
//
// Shape checks only. The values themselves — the stock ceiling, the
// zero-delta rule, unknown sort keys — are enforced in
// InventoryService, so stock written through any path gets the same
// treatment.

import { ApiError } from "../utils/ApiError.js";
import { STOCK_STATUSES } from "../config/stock.policy.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_BULK_ADJUSTMENTS = 200;

const isUuid = (value) => UUID_REGEX.test(String(value ?? "").trim());

export const validateInventoryQuery = (req, res, next) => {
  try {
    const { status, categoryId, productId, page, limit } = req.query ?? {};

    const errors = {};

    if (status !== undefined && !STOCK_STATUSES.includes(status)) {
      errors.status = `Unknown stock status. Expected one of: ${STOCK_STATUSES.join(", ")}.`;
    }

    if (categoryId !== undefined && !isUuid(categoryId)) {
      errors.categoryId = "Invalid category ID format";
    }

    if (productId !== undefined && !isUuid(productId)) {
      errors.productId = "Invalid product ID format";
    }

    if (page !== undefined && (!Number.isInteger(Number(page)) || Number(page) < 1)) {
      errors.page = "Page must be a positive whole number";
    }

    if (limit !== undefined && (!Number.isInteger(Number(limit)) || Number(limit) < 1)) {
      errors.limit = "Limit must be a positive whole number";
    }

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const validateVariantIdParam = (req, res, next) => {
  try {
    const id = req.params?.id;

    if (!isUuid(id)) {
      throw new ApiError(400, "Invalid variant ID format");
    }

    req.params.id = String(id).trim();
    next();
  } catch (error) {
    next(error);
  }
};

export const validateAdjustStock = (req, res, next) => {
  try {
    const { delta } = req.body ?? {};

    if (delta === undefined || delta === null || delta === "") {
      throw new ApiError(400, "Validation failed", {
        delta: "An adjustment is required",
      });
    }

    if (!Number.isInteger(Number(delta))) {
      throw new ApiError(400, "Validation failed", {
        delta: "Adjustment must be a whole number",
      });
    }

    if (Number(delta) === 0) {
      throw new ApiError(400, "Validation failed", {
        delta: "Adjustment cannot be zero",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const validateSetStock = (req, res, next) => {
  try {
    const { stockQuantity, expectedStockQuantity } = req.body ?? {};

    const errors = {};

    if (stockQuantity === undefined || stockQuantity === null || stockQuantity === "") {
      errors.stockQuantity = "Stock quantity is required";
    } else if (!Number.isInteger(Number(stockQuantity))) {
      errors.stockQuantity = "Stock quantity must be a whole number";
    } else if (Number(stockQuantity) < 0) {
      errors.stockQuantity = "Stock quantity cannot be negative";
    }

    if (
      expectedStockQuantity !== undefined &&
      expectedStockQuantity !== null &&
      expectedStockQuantity !== "" &&
      !Number.isInteger(Number(expectedStockQuantity))
    ) {
      errors.expectedStockQuantity = "Expected stock must be a whole number";
    }

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const validateBulkAdjustStock = (req, res, next) => {
  try {
    const { adjustments } = req.body ?? {};

    if (!Array.isArray(adjustments)) {
      throw new ApiError(400, "Validation failed", {
        adjustments: "Adjustments must be an array",
      });
    }

    if (adjustments.length === 0) {
      throw new ApiError(400, "Validation failed", {
        adjustments: "At least one adjustment is required",
      });
    }

    if (adjustments.length > MAX_BULK_ADJUSTMENTS) {
      throw new ApiError(400, "Validation failed", {
        adjustments: `At most ${MAX_BULK_ADJUSTMENTS} adjustments can be applied at once`,
      });
    }

    const errors = {};

    adjustments.forEach((adjustment, index) => {
      const path = `Adjustment at index ${index}`;

      if (!isUuid(adjustment?.variantId)) {
        errors[`adjustments.${index}.variantId`] = `${path}: invalid variant ID format`;
      }

      const delta = adjustment?.delta;

      if (delta === undefined || delta === null || delta === "") {
        errors[`adjustments.${index}.delta`] = `${path}: an adjustment is required`;
      } else if (!Number.isInteger(Number(delta))) {
        errors[`adjustments.${index}.delta`] = `${path}: adjustment must be a whole number`;
      } else if (Number(delta) === 0) {
        errors[`adjustments.${index}.delta`] = `${path}: adjustment cannot be zero`;
      }
    });

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

    next();
  } catch (error) {
    next(error);
  }
};
