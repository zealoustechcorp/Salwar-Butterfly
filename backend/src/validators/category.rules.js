const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const validateCategoryName = (value, required = true) => {
  if (value === undefined || value === null) {
    return required ? "Category name is required" : null;
  }

  if (typeof value !== "string") {
    return "Category name must be a string";
  }

  const name = value.trim();

  if (!name) {
    return "Category name cannot be empty";
  }

  if (name.length < 2) {
    return "Category name must be at least 2 characters";
  }

  if (name.length > 255) {
    return "Category name must not exceed 255 characters";
  }

  return null;
};

export const validateCategorySlug = (value, required = true) => {
  if (value === undefined || value === null) {
    return required ? "Category slug is required" : null;
  }

  if (typeof value !== "string") {
    return "Category slug must be a string";
  }

  const slug = value.trim().toLowerCase();

  if (!slug) {
    return "Category slug cannot be empty";
  }

  if (slug.length < 2) {
    return "Category slug must be at least 2 characters";
  }

  if (slug.length > 255) {
    return "Category slug must not exceed 255 characters";
  }

  if (!SLUG_REGEX.test(slug)) {
    return "Category slug may contain only lowercase letters, numbers and hyphens";
  }

  return null;
};

export const validateCategoryDescription = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return "Description must be a string";
  }

  if (value.trim().length > 5000) {
    return "Description must not exceed 5000 characters";
  }

  return null;
};

export const validateCategoryFits = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        return "Fits must be a valid JSON object";
      }
      return null;
    } catch {
      return "Fits must be valid JSON";
    }
  }

  if (typeof value === "object" && !Array.isArray(value) && value !== null) {
    return null;
  }

  return "Fits must be a JSON object or valid JSON string";
};

export const validateCategoryActive = (value) => {
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

  return "Active must be a boolean";
};
