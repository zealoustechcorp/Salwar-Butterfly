import { ApiError } from "../utils/ApiError.js";
import {
  validateProductName,
  validateProductSlug,
  validateProductDescription,
  validateProductCategoryId,
  validateProductSubCategoryId,
  validateProductBasePrice,
  validateProductDiscountPercentage,
  validateProductSalePrice,
  validateProductIsFeatured,
  validateProductActive,
  validateProductAttributes,
  normalizeProductAttributes,
} from "./product.rules.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeBoolean = (value) => {
  if (value === undefined || value === null) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return value;
};

export const validateCreateProduct = (req, res, next) => {
  try {
    const {
      name,
      slug,
      description,
      categoryId,
      subCategoryId,
      basePrice,
      discountPercentage,
      attributes,
      isFeatured,
      active,
    } = req.body;

    const errors = {};

    const nameError = validateProductName(name, true);
    if (nameError) errors.name = nameError;

    const slugError = validateProductSlug(slug, true);
    if (slugError) errors.slug = slugError;

    const descriptionError = validateProductDescription(description);
    if (descriptionError) errors.description = descriptionError;

    const categoryIdError = validateProductCategoryId(categoryId, true);
    if (categoryIdError) errors.categoryId = categoryIdError;

    const subCategoryIdError = validateProductSubCategoryId(subCategoryId);
    if (subCategoryIdError) errors.subCategoryId = subCategoryIdError;

    const basePriceError = validateProductBasePrice(basePrice, true);
    if (basePriceError) errors.basePrice = basePriceError;

    // The pair, not just each field. Both can be valid alone and still
    // leave the customer paying nothing between them — see
    // validateProductSalePrice. Create has both to hand; update may send
    // only one, so its version of this check lives in the service, where
    // the sent field is merged with the stored one.
    const discountError =
      validateProductDiscountPercentage(discountPercentage) ??
      validateProductSalePrice(basePrice, discountPercentage);
    if (discountError) errors.discountPercentage = discountError;

    const attributesError = validateProductAttributes(attributes);
    if (attributesError) errors.attributes = attributesError;

    const isFeaturedError = validateProductIsFeatured(isFeatured);
    if (isFeaturedError) errors.isFeatured = isFeaturedError;

    const activeError = validateProductActive(active);
    if (activeError) errors.active = activeError;

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

    req.body.name = name.trim();
    req.body.slug = slug.trim().toLowerCase();
    req.body.description =
      typeof description === "string" ? description.trim() : null;
    req.body.categoryId = String(categoryId).trim();
    req.body.subCategoryId = subCategoryId
      ? String(subCategoryId).trim()
      : null;
    req.body.basePrice = Number(basePrice);
    req.body.discountPercentage =
      discountPercentage !== undefined ? Number(discountPercentage) : 0;
    req.body.attributes = normalizeProductAttributes(attributes);
    req.body.isFeatured = normalizeBoolean(isFeatured) ?? false;
    req.body.active = normalizeBoolean(active) ?? true;

    next();
  } catch (error) {
    next(error);
  }
};

export const validateUpdateProduct = (req, res, next) => {
  try {
    const productId = req.params?.id;

    if (
      productId === undefined ||
      productId === null ||
      String(productId).trim() === ""
    ) {
      throw new ApiError(400, "Product ID is required");
    }

    if (!UUID_REGEX.test(String(productId).trim())) {
      throw new ApiError(400, "Invalid product ID format");
    }

    const body = req.body ?? {};
    const {
      name,
      slug,
      description,
      subCategoryId,
      basePrice,
      discountPercentage,
      attributes,
      isFeatured,
      active,
    } = body;

    const hasBodyField =
      name !== undefined ||
      slug !== undefined ||
      description !== undefined ||
      basePrice !== undefined ||
      discountPercentage !== undefined ||
      attributes !== undefined ||
      isFeatured !== undefined ||
      active !== undefined ||
      subCategoryId !== undefined;

    if (!hasBodyField) {
      throw new ApiError(400, "At least one field is required to update");
    }

    const errors = {};

    if (name !== undefined) {
      const error = validateProductName(name, false);
      if (error) {
        errors.name = error;
      } else {
        req.body.name = name.trim();
      }
    }

    if (slug !== undefined) {
      const error = validateProductSlug(slug, false);
      if (error) {
        errors.slug = error;
      } else {
        req.body.slug = slug.trim().toLowerCase();
      }
    }

    if (description !== undefined) {
      const error = validateProductDescription(description);
      if (error) {
        errors.description = error;
      } else {
        req.body.description =
          typeof description === "string" ? description.trim() : description;
      }
    }

    if (basePrice !== undefined) {
      const error = validateProductBasePrice(basePrice, false);
      if (error) {
        errors.basePrice = error;
      } else {
        req.body.basePrice = Number(basePrice);
      }
    }

    if (discountPercentage !== undefined) {
      const error = validateProductDiscountPercentage(discountPercentage);
      if (error) {
        errors.discountPercentage = error;
      } else {
        req.body.discountPercentage = Number(discountPercentage);
      }
    }

    if (subCategoryId !== undefined) {
      const error = validateProductSubCategoryId(subCategoryId);
      if (error) {
        errors.subCategoryId = error;
      } else {
        req.body.subCategoryId = subCategoryId
          ? String(subCategoryId).trim()
          : null;
      }
    }

    if (attributes !== undefined) {
      const error = validateProductAttributes(attributes);
      if (error) {
        errors.attributes = error;
      } else {
        req.body.attributes = normalizeProductAttributes(attributes);
      }
    }

    if (isFeatured !== undefined) {
      const error = validateProductIsFeatured(isFeatured);
      if (error) {
        errors.isFeatured = error;
      } else {
        req.body.isFeatured = normalizeBoolean(isFeatured);
      }
    }

    if (active !== undefined) {
      const error = validateProductActive(active);
      if (error) {
        errors.active = error;
      } else {
        req.body.active = normalizeBoolean(active);
      }
    }

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

    req.params.id = String(productId).trim();
    next();
  } catch (error) {
    next(error);
  }
};
