const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const validateSubCategoryName = (value, required = true) => {
  if (value === undefined || value === null) {
    return required ? "Sub-category name is required" : null;
  }

  if (typeof value !== "string") {
    return "Sub-category name must be a string";
  }

  const name = value.trim();

  if (!name) {
    return "Sub-category name cannot be empty";
  }

  if (name.length < 2) {
    return "Sub-category name must be at least 2 characters";
  }

  if (name.length > 255) {
    return "Sub-category name must not exceed 255 characters";
  }

  return null;
};

export const validateCategoryId = (value, required = true) => {
  if (value === undefined || value === null) {
    return required ? "Category ID is required" : null;
  }

  const categoryId = String(value).trim();

  if (!categoryId) {
    return "Category ID cannot be empty";
  }

  if (!UUID_REGEX.test(categoryId)) {
    return "Category ID must be a valid UUID (format: 550e8400-e29b-41d4-a716-446655440000)";
  }

  return null;
};

export const validateSubCategoryIsActive = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return null;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "false") {
      return null;
    }
  }

  return "isActive must be a boolean (true or false)";
};
