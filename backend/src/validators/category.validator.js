import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import {
  validateCategoryName,
  validateCategorySlug,
  validateCategoryDescription,
  validateCategoryFits,
  validateCategoryActive,
} from "./category.rules.js";

const CREATE_ALLOWED_FIELDS = new Set([
  "name",
  "slug",
  "description",
  "fits",
  "active",
]);
const UPDATE_ALLOWED_FIELDS = new Set([
  "name",
  "slug",
  "description",
  "fits",
  "active",
  "image",
  "imagePublicId",
]);

const normalizeBoolean = (value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return value;
};

const validateUnknownFields = (body, allowedFields) => {
  const errors = {};
  for (const field of Object.keys(body)) {
    if (!allowedFields.has(field)) {
      errors[field] = `Field "${field}" is not allowed`;
    }
  }
  return errors;
};

export const validateCreateCategory = (req, res, next) => {
  try {
    const body = req.body ?? {};
    const { name, slug, description, fits, active } = body;
    const errors = {};

    Object.assign(errors, validateUnknownFields(body, CREATE_ALLOWED_FIELDS));

    const nameError = validateCategoryName(name, true);
    if (nameError) errors.name = nameError;

    const slugError = validateCategorySlug(slug, true);
    if (slugError) errors.slug = slugError;

    const descriptionError = validateCategoryDescription(description);
    if (descriptionError) errors.description = descriptionError;

    const fitsError = validateCategoryFits(fits);
    if (fitsError) errors.fits = fitsError;

    const activeError = validateCategoryActive(active);
    if (activeError) errors.active = activeError;

    if (Object.keys(errors).length > 0) {
      logger.warn("Category validation failed on create", { errors, body });
      throw new ApiError(400, "Category validation failed", errors);
    }

    const normalizedName = name.trim();
    const normalizedSlug = slug.trim().toLowerCase();
    const normalizedDescription =
      typeof description === "string" ? description.trim() || null : null;
    let normalizedFits = null;

    if (fits) {
      if (typeof fits === "string") {
        try {
          normalizedFits = JSON.parse(fits);
        } catch {
          normalizedFits = null;
        }
      } else if (typeof fits === "object") {
        normalizedFits = fits;
      }
    }

    const normalizedActive =
      active === undefined ? true : normalizeBoolean(active);

    req.body = {
      name: normalizedName,
      slug: normalizedSlug,
      description: normalizedDescription,
      fits: normalizedFits,
      active: normalizedActive,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const validateUpdateCategory = (req, res, next) => {
  try {
    const categoryId = req.params?.id;

    if (
      categoryId === undefined ||
      categoryId === null ||
      String(categoryId).trim() === ""
    ) {
      throw new ApiError(400, "Category ID is required");
    }

    const body = req.body ?? {};
    const { name, slug, description, fits, active } = body;
    const errors = {};

    Object.assign(errors, validateUnknownFields(body, UPDATE_ALLOWED_FIELDS));

    const hasBodyField =
      name !== undefined ||
      slug !== undefined ||
      description !== undefined ||
      fits !== undefined ||
      active !== undefined;
    const hasNewImage = Boolean(req.file);

    if (!hasBodyField && !hasNewImage) {
      throw new ApiError(400, "At least one field is required to update");
    }

    if (name !== undefined) {
      const error = validateCategoryName(name, false);
      if (error) errors.name = error;
    }

    if (slug !== undefined) {
      const error = validateCategorySlug(slug, false);
      if (error) errors.slug = error;
    }

    if (description !== undefined) {
      const error = validateCategoryDescription(description);
      if (error) errors.description = error;
    }

    if (fits !== undefined) {
      const error = validateCategoryFits(fits);
      if (error) errors.fits = error;
    }

    if (active !== undefined) {
      const error = validateCategoryActive(active);
      if (error) errors.active = error;
    }

    if (Object.keys(errors).length > 0) {
      logger.warn("Category validation failed on update", {
        errors,
        categoryId,
        body,
      });
      throw new ApiError(400, "Category validation failed", errors);
    }

    const sanitizedBody = {};

    if (name !== undefined) sanitizedBody.name = name.trim();
    if (slug !== undefined) sanitizedBody.slug = slug.trim().toLowerCase();
    if (description !== undefined) {
      sanitizedBody.description =
        typeof description === "string"
          ? description.trim() || null
          : description;
    }

    if (fits !== undefined) {
      if (fits) {
        if (typeof fits === "string") {
          try {
            sanitizedBody.fits = JSON.parse(fits);
          } catch {
            sanitizedBody.fits = null;
          }
        } else if (typeof fits === "object") {
          sanitizedBody.fits = fits;
        }
      } else {
        sanitizedBody.fits = null;
      }
    }

    if (active !== undefined) sanitizedBody.active = normalizeBoolean(active);

    req.body = sanitizedBody;
    req.params.id = String(categoryId).trim();

    next();
  } catch (error) {
    next(error);
  }
};
