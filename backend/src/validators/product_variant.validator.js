import { ApiError } from "../utils/ApiError.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_VARIANTS_PER_PRODUCT = 200;

/**
 * Shape checks only. The values themselves — trimming, upper-casing,
 * the stock ceiling, duplicate (size, colour) pairs — are normalized in
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

/**
 * Colour is optional everywhere size is required: a product that is not
 * sold by colour is a normal product, not an incomplete one. Null and ""
 * are both accepted and both mean the same thing.
 */
const validateColour = (value, path) => {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value !== "string") return `${path}: colour must be text`;

  if (value.trim().length > 40) {
    return `${path}: colour must not exceed 40 characters`;
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
    const { productId, size, colour, stockQuantity, active } = req.body ?? {};

    const errors = {};

    if (!productId || !UUID_REGEX.test(String(productId).trim())) {
      errors.productId = "Invalid product ID format";
    }

    const sizeError = validateSize(size, "Variant");
    if (sizeError) errors.size = sizeError;

    const colourError = validateColour(colour, "Variant");
    if (colourError) errors.colour = colourError;

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

    if (variants.length > MAX_VARIANTS_PER_PRODUCT) {
      throw new ApiError(400, "Validation failed", {
        variants: `A product may not have more than ${MAX_VARIANTS_PER_PRODUCT} size and colour combinations`,
      });
    }

    const errors = {};

    variants.forEach((variant, index) => {
      const path = `Variant at index ${index}`;

      const sizeError = validateSize(variant?.size, path);
      if (sizeError) errors[`variants.${index}.size`] = sizeError;

      const colourError = validateColour(variant?.colour, path);
      if (colourError) errors[`variants.${index}.colour`] = colourError;

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

/**
 * Shape of a multi-select payload (F-03.11). The cap, the duplicates
 * and the "does it exist" question are the service's, so that a
 * selection acted on through any path is treated the same.
 */
const validateVariantIdList = (variantIds) => {
  if (!Array.isArray(variantIds)) {
    return "variantIds must be an array";
  }

  if (variantIds.length === 0) {
    return "At least one size must be selected";
  }

  const bad = variantIds.findIndex(
    (id) => !UUID_REGEX.test(String(id ?? "").trim()),
  );

  if (bad !== -1) {
    return `Invalid variant ID format at index ${bad}`;
  }

  return null;
};

export const validateBulkVariantStatus = (req, res, next) => {
  try {
    const { variantIds, active } = req.body ?? {};

    const errors = {};

    const listError = validateVariantIdList(variantIds);
    if (listError) errors.variantIds = listError;

    if (active === undefined || active === null || active === "") {
      errors.active = "active is required";
    } else {
      const activeError = validateActive(active, "Variant");
      if (activeError) errors.active = activeError;
    }

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const validateBulkVariantDelete = (req, res, next) => {
  try {
    const { variantIds, force } = req.body ?? {};

    const errors = {};

    const listError = validateVariantIdList(variantIds);
    if (listError) errors.variantIds = listError;

    if (force !== undefined) {
      const forceError = validateActive(force, "force");
      if (forceError) errors.force = "force must be a boolean";
    }

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

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

    const { size, colour, stockQuantity, active } = req.body ?? {};

    if (
      size === undefined &&
      colour === undefined &&
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

    if (colour !== undefined) {
      const error = validateColour(colour, "Variant");
      if (error) errors.colour = error;
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
