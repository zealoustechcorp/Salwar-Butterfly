import { ApiError } from "../utils/ApiError.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GROUP_NAME_REGEX = /^[a-z][a-z0-9_]*$/i;

/** '#abc', '#AABBCC' or the same without the hash. */
const HEX_REGEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Shape checks only — trimming, lowercasing the group, expanding hex
 * shorthand and the rest of the normalizing happens in
 * AttributeValueService, so a value written through any path is treated
 * the same.
 */

/**
 * The swatch. Optional on every group and meaningless on most of them —
 * only colour renders it — so an absent or empty hex is never an error.
 */
const validateHex = (value) => {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value !== "string" || !HEX_REGEX.test(value.trim())) {
    return "Colour must be a hex code such as #7B1E3A";
  }

  return null;
};

export const validateCreateAttributeValue = (req, res, next) => {
  try {
    const { groupName, value, hex, active, position } = req.body ?? {};

    const errors = {};

    if (typeof groupName !== "string" || !groupName.trim()) {
      errors.groupName = "Attribute group is required";
    } else if (groupName.trim().length > 40) {
      errors.groupName = "Attribute group must not exceed 40 characters";
    } else if (!GROUP_NAME_REGEX.test(groupName.trim())) {
      errors.groupName =
        "Attribute group may contain only letters, numbers and underscores";
    }

    if (typeof value !== "string" || !value.trim()) {
      errors.value = "Value is required";
    } else if (value.trim().length > 100) {
      errors.value = "Value must not exceed 100 characters";
    }

    const hexError = validateHex(hex);
    if (hexError) errors.hex = hexError;

    if (active !== undefined && typeof active !== "boolean") {
      errors.active = "Active must be a boolean";
    }

    if (position !== undefined && position !== null && position !== "") {
      if (Number.isNaN(Number(position))) {
        errors.position = "Position must be a number";
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

export const validateUpdateAttributeValue = (req, res, next) => {
  try {
    const id = req.params?.id;

    if (!id || !UUID_REGEX.test(String(id).trim())) {
      throw new ApiError(400, "Invalid attribute value ID format");
    }

    const { value, hex, active, position } = req.body ?? {};

    if (
      value === undefined &&
      hex === undefined &&
      active === undefined &&
      position === undefined
    ) {
      throw new ApiError(400, "At least one field is required to update");
    }

    const errors = {};

    if (value !== undefined) {
      if (typeof value !== "string" || !value.trim()) {
        errors.value = "Value cannot be empty";
      } else if (value.trim().length > 100) {
        errors.value = "Value must not exceed 100 characters";
      }
    }

    // null and "" are allowed through: clearing a swatch is an edit.
    const hexError = validateHex(hex);
    if (hexError) errors.hex = hexError;

    if (active !== undefined && typeof active !== "boolean") {
      errors.active = "Active must be a boolean";
    }

    if (position !== undefined && Number.isNaN(Number(position))) {
      errors.position = "Position must be a number";
    }

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

    req.params.id = String(id).trim();
    next();
  } catch (error) {
    next(error);
  }
};
