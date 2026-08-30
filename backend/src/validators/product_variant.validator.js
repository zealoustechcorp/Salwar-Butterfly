import { ApiError } from "../utils/ApiError.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_SIZES_PER_PRODUCT = 50;

/**
 * Shape checks only. The values themselves — trimming, upper-casing,
 * the stock ceiling, duplicate sizes — are normalized in
 * ProductVariantService, so that a variant written through any path
 * gets the same treatment.
 */

const validateSize = (value, path) => {
  if (typeof value !== "string" || !value.trim()) {
    return `${path}: size is required`;
  }

  if (value.trim().length > 20) {
    return `${path}: size must not exceed 20 characters`;
  }

  return null;
};

const validateStock = (value, path) => {
  if (value === undefined || value === null || value === "") return null;

  const stock = Number(value);

  if (Number.isNaN(stock)) return `${path}: stock must be a number`;
  if (!Number.isInteger(stock)) return `${path}: stock must be a whole number`;
  if (stock < 0) return `${path}: stock cannot be negative`;

  return null;
};

const validateActive = (value, path) => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return null;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "false") return null;
  }

  return `${path}: active must be a boolean`;
};

export const validateCreateVariant = (req, res, next) => {
  try {
    const { productId, size, stockQuantity, active } = req.body ?? {};

    const errors = {};

    if (!productId || !UUID_REGEX.test(String(productId).trim())) {
      errors.productId = "Invalid product ID format";
    }

    const sizeError = validateSize(size, "Variant");
    if (sizeError) errors.size = sizeError;

    const stockError = validateStock(stockQuantity, "Variant");
    if (stockError) errors.stockQuantity = stockError;

    const activeError = validateActive(active, "Variant");
    if (activeError) errors.active = activeError;

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const validateReplaceVariants = (req, res, next) => {
  try {
    const productId = req.params?.productId;

    if (!productId || !UUID_REGEX.test(String(productId).trim())) {
      throw new ApiError(400, "Invalid product ID format");
    }

    const { variants } = req.body ?? {};

    if (!Array.isArray(variants)) {
      throw new ApiError(400, "Validation failed", {
        variants: "Variants must be an array",
      });
    }

    if (variants.length > MAX_SIZES_PER_PRODUCT) {
      throw new ApiError(400, "Validation failed", {
        variants: `A product may not have more than ${MAX_SIZES_PER_PRODUCT} sizes`,
      });
    }

    const errors = {};

    variants.forEach((variant, index) => {
      const path = `Variant at index ${index}`;

      const sizeError = validateSize(variant?.size, path);
      if (sizeError) errors[`variants.${index}.size`] = sizeError;

      const stockError = validateStock(variant?.stockQuantity, path);
      if (stockError) errors[`variants.${index}.stockQuantity`] = stockError;

      const activeError = validateActive(variant?.active, path);
      if (activeError) errors[`variants.${index}.active`] = activeError;
    });

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

    req.params.productId = String(productId).trim();
    next();
  } catch (error) {
    next(error);
  }
};

export const validateUpdateVariant = (req, res, next) => {
  try {
    const variantId = req.params?.id;

    if (!variantId || !UUID_REGEX.test(String(variantId).trim())) {
      throw new ApiError(400, "Invalid variant ID format");
    }

    const { size, stockQuantity, active } = req.body ?? {};

    if (
      size === undefined &&
      stockQuantity === undefined &&
      active === undefined
    ) {
      throw new ApiError(400, "At least one field is required to update");
    }

    const errors = {};

    if (size !== undefined) {
      const error = validateSize(size, "Variant");
      if (error) errors.size = error;
    }

    if (stockQuantity !== undefined) {
      const error = validateStock(stockQuantity, "Variant");
      if (error) errors.stockQuantity = error;
    }

    if (active !== undefined) {
      const error = validateActive(active, "Variant");
      if (error) errors.active = error;
    }

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

    req.params.id = String(variantId).trim();
    next();
  } catch (error) {
    next(error);
  }
};
