const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const validateProductName = (value, required = true) => {
  if (value === undefined || value === null) {
    return required ? "Product name is required" : null;
  }

  if (typeof value !== "string") {
    return "Product name must be a string";
  }

  const name = value.trim();
  if (!name) return "Product name cannot be empty";
  if (name.length < 2) return "Product name must be at least 2 characters";
  if (name.length > 200) return "Product name must not exceed 200 characters";

  return null;
};

export const validateProductSlug = (value, required = true) => {
  if (value === undefined || value === null) {
    return required ? "Product slug is required" : null;
  }

  if (typeof value !== "string") {
    return "Product slug must be a string";
  }

  const slug = value.trim().toLowerCase();
  if (!slug) return "Product slug cannot be empty";
  if (slug.length < 2) return "Product slug must be at least 2 characters";
  if (slug.length > 255) return "Product slug must not exceed 255 characters";
  if (!SLUG_REGEX.test(slug)) {
    return "Product slug may contain only lowercase letters, numbers and hyphens";
  }

  return null;
};

export const validateProductDescription = (value) => {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value !== "string") {
    return "Description must be a string";
  }

  if (value.trim().length > 5000) {
    return "Description must not exceed 5000 characters";
  }

  return null;
};

export const validateProductCategoryId = (value, required = true) => {
  if (value === undefined || value === null) {
    return required ? "Category ID is required" : null;
  }

  if (!UUID_REGEX.test(String(value).trim())) {
    return "Invalid category ID format";
  }

  return null;
};

export const validateProductSubCategoryId = (value) => {
  if (value === undefined || value === null || value === "") return null;

  if (!UUID_REGEX.test(String(value).trim())) {
    return "Invalid sub-category ID format";
  }

  return null;
};

export const validateProductBasePrice = (value, required = true) => {
  if (value === undefined || value === null) {
    return required ? "Base price is required" : null;
  }

  const price = Number(value);
  if (isNaN(price)) return "Base price must be a number";
  if (price < 0) return "Base price cannot be negative";
  if (price > 999999.99) return "Base price exceeds maximum limit";

  return null;
};

export const validateProductDiscountPercentage = (value) => {
  if (value === undefined || value === null || value === "") return null;

  const discount = Number(value);
  if (isNaN(discount)) return "Discount percentage must be a number";
  if (discount < 0 || discount > 100) {
    return "Discount percentage must be between 0 and 100";
  }

  return null;
};

export const validateProductIsFeatured = (value) => {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value === "boolean") return null;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "false") return null;
  }

  return "Is featured must be a boolean";
};

export const validateProductActive = (value) => {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value === "boolean") return null;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "false") return null;
  }

  return "Active must be a boolean";
};
