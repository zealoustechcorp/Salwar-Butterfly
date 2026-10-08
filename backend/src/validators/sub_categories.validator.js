import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import {
  validateSubCategoryName,
  validateCategoryId,
  validateSubCategoryIsActive,
} from "./sub_categories.rules.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CREATE_ALLOWED_FIELDS = new Set(["name", "categoryId", "isActive"]);
const UPDATE_ALLOWED_FIELDS = new Set(["name", "categoryId", "isActive"]);

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

export const validateCreateSubCategory = (req, res, next) => {
  try {
    const body = req.body ?? {};
    const { name, categoryId, isActive } = body;
    const errors = {};

    Object.assign(errors, validateUnknownFields(body, CREATE_ALLOWED_FIELDS));

    if (!name || typeof name !== "string" || !name.trim()) {
      errors.name = "Sub-category name is required";
    } else if (name.trim().length < 2) {
      errors.name = "Sub-category name must be at least 2 characters";
    } else if (name.trim().length > 255) {
      errors.name = "Sub-category name must not exceed 255 characters";
    }

    if (!categoryId || typeof categoryId !== "string") {
      errors.categoryId = "Category ID is required";
    } else {
      const categoryIdStr = String(categoryId).trim();
      if (!UUID_REGEX.test(categoryIdStr)) {
        errors.categoryId = "Category ID must be a valid UUID";
      }
    }

    if (isActive !== undefined) {
      if (typeof isActive !== "boolean" && typeof isActive !== "string") {
        errors.isActive = "isActive must be a boolean";
      } else if (typeof isActive === "string") {
        const normalized = isActive.trim().toLowerCase();
        if (normalized !== "true" && normalized !== "false") {
          errors.isActive = "isActive must be a boolean";
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      logger.warn("Sub-category validation failed on create", { errors, body });
      throw new ApiError(400, "Sub-category validation failed", errors);
    }

    const normalizedName = name.trim();
    const normalizedCategoryId = String(categoryId).trim();
    const normalizedIsActive =
      isActive === undefined ? true : normalizeBoolean(isActive);

    req.body = {
      name: normalizedName,
      categoryId: normalizedCategoryId,
      isActive: normalizedIsActive,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const validateUpdateSubCategory = (req, res, next) => {
  try {
    const subCategoryId = req.params?.id;

    if (!subCategoryId || String(subCategoryId).trim() === "") {
      throw new ApiError(400, "Sub-category ID is required");
    }

    const normalizedSubCategoryId = String(subCategoryId).trim();

    if (!UUID_REGEX.test(normalizedSubCategoryId)) {
      throw new ApiError(400, "Invalid sub-category ID format");
    }

    const body = req.body ?? {};
    const { name, categoryId, isActive } = body;
    const errors = {};

    Object.assign(errors, validateUnknownFields(body, UPDATE_ALLOWED_FIELDS));

    const hasBodyField =
      name !== undefined || categoryId !== undefined || isActive !== undefined;

    if (!hasBodyField) {
      throw new ApiError(400, "At least one field is required to update");
    }

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        errors.name = "Sub-category name cannot be empty";
      } else if (name.trim().length < 2) {
        errors.name = "Sub-category name must be at least 2 characters";
      } else if (name.trim().length > 255) {
        errors.name = "Sub-category name must not exceed 255 characters";
      }
    }

    if (categoryId !== undefined) {
      if (!categoryId || typeof categoryId !== "string") {
        errors.categoryId = "Category ID is required";
      } else {
        const categoryIdStr = String(categoryId).trim();
        if (!UUID_REGEX.test(categoryIdStr)) {
          errors.categoryId = "Category ID must be a valid UUID";
        }
      }
    }

    if (isActive !== undefined) {
      if (typeof isActive !== "boolean" && typeof isActive !== "string") {
        errors.isActive = "isActive must be a boolean";
      } else if (typeof isActive === "string") {
        const normalized = isActive.trim().toLowerCase();
        if (normalized !== "true" && normalized !== "false") {
          errors.isActive = "isActive must be a boolean";
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      logger.warn("Sub-category validation failed on update", {
        errors,
        subCategoryId: normalizedSubCategoryId,
        body,
      });
      throw new ApiError(400, "Sub-category validation failed", errors);
    }

    const sanitizedBody = {};

    if (name !== undefined) sanitizedBody.name = name.trim();
    if (categoryId !== undefined)
      sanitizedBody.categoryId = String(categoryId).trim();
    if (isActive !== undefined)
      sanitizedBody.isActive = normalizeBoolean(isActive);

    req.body = sanitizedBody;
    req.params.id = normalizedSubCategoryId;

    next();
  } catch (error) {
    next(error);
  }
};
