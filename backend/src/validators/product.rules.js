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

/**
 * The list price.
 *
 * Zero is refused, and that is stricter than the column: 001_create_produc
 * has `CHECK (base_price >= 0)`, which permits it. A product listed at ₹0
 * is never a giveaway the shop meant — it is a field left blank, or a
 * `Number("")` that fell through as 0 — and it reaches the storefront as a
 * Buy button for nothing.
 *
 * Enforced here rather than by tightening the constraint because it is a
 * policy about what may be *written*, not a statement about what the
 * table can hold: a migration would also have to answer for any row
 * already at 0, and this refuses the ones that would be new.
 *
 * The floor is a paisa rather than "anything above zero", because prices
 * are DECIMAL(10,2): 0.004 is a positive number the column rounds to 0.00,
 * which is the same free product by a longer route.
 *
 * `Number.isFinite` rather than `!isNaN`, which lets Infinity through —
 * `Number("1e999")` is Infinity, and it passes a `> 999999.99` check by
 * failing to be less than it.
 */
export const MIN_PRICE = 0.01;

export const validateProductBasePrice = (value, required = true) => {
  if (value === undefined || value === null || value === "") {
    return required ? "Base price is required" : null;
  }

  const price = Number(value);
  if (!Number.isFinite(price)) return "Base price must be a number";
  if (price < 0) return "Base price cannot be negative";
  if (price < MIN_PRICE) return `Base price must be at least ${MIN_PRICE.toFixed(2)}`;
  if (price > 999999.99) return "Base price exceeds maximum limit";

  return null;
};

export const validateProductDiscountPercentage = (value) => {
  if (value === undefined || value === null || value === "") return null;

  const discount = Number(value);
  if (!Number.isFinite(discount)) return "Discount percentage must be a number";
  if (discount < 0 || discount > 100) {
    return "Discount percentage must be between 0 and 100";
  }

  return null;
};

/**
 * What the customer would actually pay, which is where the real rule is.
 *
 * The two price fields can each be valid and still leave a free product
 * between them: 100% off, or a base price small enough that the discount
 * rounds it away (₹100 at 99.99% off is ₹0.01 before rounding and ₹0.00
 * after). Checking the derived figure catches every route to zero in one
 * place, including ones nobody has thought of yet.
 *
 * The arithmetic is `calculateCurrentPrice` in product.service.js, and has
 * to stay that way — a check that rounded differently from the writer
 * would pass a product the service then stores at 0.
 *
 * @param {unknown} basePrice
 * @param {unknown} discountPercentage
 * @returns {string|null} a message, or null when there is something to pay
 */
export const validateProductSalePrice = (basePrice, discountPercentage) => {
  // Whatever is wrong with either field alone is the better message.
  if (
    validateProductBasePrice(basePrice) ||
    validateProductDiscountPercentage(discountPercentage)
  ) {
    return null;
  }

  const base = Number(basePrice);
  const discount = Number(discountPercentage) || 0;
  const current = Math.round((base - (base * discount) / 100) * 100) / 100;

  if (current >= MIN_PRICE) return null;

  return discount >= 100
    ? "A 100% discount would make this product free"
    : "That discount leaves the customer paying 0";
};

/**
 * Free-form product attributes — { fabric, work, sleeve, ... }.
 *
 * Deliberately not a fixed key list: which attributes matter differs by
 * category and grows over time. What is enforced is that the document
 * stays a flat string map, so it can never become a nested blob that the
 * admin dropdowns and any future filter cannot read.
 */
export const validateProductAttributes = (value) => {
  if (value === undefined || value === null || value === "") return null;

  let attributes = value;

  // Multipart and query bodies arrive as strings.
  if (typeof attributes === "string") {
    try {
      attributes = JSON.parse(attributes);
    } catch {
      return "Attributes must be valid JSON";
    }
  }

  if (
    typeof attributes !== "object" ||
    Array.isArray(attributes) ||
    attributes === null
  ) {
    return "Attributes must be a JSON object";
  }

  const keys = Object.keys(attributes);

  if (keys.length > 20) {
    return "A product may not have more than 20 attributes";
  }

  for (const key of keys) {
    if (key.trim().length === 0) return "Attribute names cannot be empty";
    if (key.length > 40) {
      return `Attribute name "${key}" must not exceed 40 characters`;
    }

    const entry = attributes[key];
    if (entry === null || entry === undefined) continue;

    if (typeof entry !== "string") {
      return `Attribute "${key}" must be text`;
    }

    if (entry.length > 100) {
      return `Attribute "${key}" must not exceed 100 characters`;
    }
  }

  return null;
};

/**
 * Parses and tidies an attribute document for storage: values trimmed,
 * blanks dropped (a cleared dropdown means "not recorded", not an empty
 * string), keys lowercased so "Fabric" and "fabric" cannot both exist.
 */
export const normalizeProductAttributes = (value) => {
  if (value === undefined || value === null || value === "") return {};

  const source = typeof value === "string" ? JSON.parse(value) : value;
  const out = {};

  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry !== "string") continue;

    const trimmed = entry.trim();
    if (!trimmed) continue;

    out[key.trim().toLowerCase()] = trimmed;
  }

  return out;
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
