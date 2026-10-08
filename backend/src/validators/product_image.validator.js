import { ApiError } from "../utils/ApiError.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_ALT_TEXT = 200;

/**
 * Shape checks only. Ownership — that an image actually belongs to the
 * product being reordered — needs the database and is settled in
 * ProductImageService, so that every path gets the same check.
 */

const isUuid = (value) =>
  typeof value === "string" && UUID_REGEX.test(value.trim());

export const validateProductIdParam = (req, res, next) => {
  try {
    const { productId } = req.params ?? {};

    if (!isUuid(productId)) {
      throw new ApiError(400, "Invalid product ID format");
    }

    req.params.productId = productId.trim();
    next();
  } catch (error) {
    next(error);
  }
};

export const validateImageIdParam = (req, res, next) => {
  try {
    const { id } = req.params ?? {};

    if (!isUuid(id)) {
      throw new ApiError(400, "Invalid image ID format");
    }

    req.params.id = id.trim();
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Runs after multer, so `req.files` is populated and the absence of a
 * file is a validation failure rather than an empty upload reaching the
 * service.
 */
export const validateUploadRequest = (req, res, next) => {
  try {
    if (!isUuid(req.params?.productId)) {
      throw new ApiError(400, "Invalid product ID format");
    }

    if (!Array.isArray(req.files) || req.files.length === 0) {
      throw new ApiError(400, "Validation failed", {
        images: 'At least one image is required. Use the field name "images".',
      });
    }

    const altText = req.body?.altText;
    const altTexts = altText === undefined ? [] : [].concat(altText);

    const errors = {};

    altTexts.forEach((value, index) => {
      if (typeof value !== "string") {
        errors[`altText.${index}`] = "Alt text must be text";
        return;
      }

      if (value.length > MAX_ALT_TEXT) {
        errors[`altText.${index}`] =
          `Alt text must not exceed ${MAX_ALT_TEXT} characters`;
      }
    });

    if (altTexts.length > req.files.length) {
      errors.altText = "More alt texts were sent than images";
    }

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

    req.params.productId = req.params.productId.trim();
    next();
  } catch (error) {
    next(error);
  }
};

export const validateUpdateImage = (req, res, next) => {
  try {
    if (!isUuid(req.params?.id)) {
      throw new ApiError(400, "Invalid image ID format");
    }

    const { altText } = req.body ?? {};

    if (altText === undefined) {
      throw new ApiError(400, "At least one field is required to update");
    }

    // Null is how the caller says "clear it and fall back to the product
    // name", so it is allowed where a non-string otherwise is not.
    if (altText !== null && typeof altText !== "string") {
      throw new ApiError(400, "Validation failed", {
        altText: "Alt text must be text",
      });
    }

    if (typeof altText === "string" && altText.length > MAX_ALT_TEXT) {
      throw new ApiError(400, "Validation failed", {
        altText: `Alt text must not exceed ${MAX_ALT_TEXT} characters`,
      });
    }

    req.params.id = req.params.id.trim();
    next();
  } catch (error) {
    next(error);
  }
};

export const validateReorderImages = (req, res, next) => {
  try {
    if (!isUuid(req.params?.productId)) {
      throw new ApiError(400, "Invalid product ID format");
    }

    const { imageIds } = req.body ?? {};

    if (!Array.isArray(imageIds)) {
      throw new ApiError(400, "Validation failed", {
        imageIds: "Image IDs must be an array",
      });
    }

    if (imageIds.length === 0) {
      throw new ApiError(400, "Validation failed", {
        imageIds: "At least one image ID is required",
      });
    }

    const errors = {};

    imageIds.forEach((id, index) => {
      if (!isUuid(id)) {
        errors[`imageIds.${index}`] = "Invalid image ID format";
      }
    });

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

    req.params.productId = req.params.productId.trim();
    next();
  } catch (error) {
    next(error);
  }
};
