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

/**
 * The fields each write accepts. Anything else is a 400 naming the field,
 * the way the category validators already treat it.
 *
 * Refused rather than dropped, because a dropped field is a silent no-op
 * the caller believes worked: `sizeChartId` was accepted on create for a
 * long time and never stored (the chart a product prints is chosen by
 * `attributes.fit`), and `categoryId` on an update was ignored while the
 * response reported success. A product changes category through
 * bulkUpdateCategory, and the message says so.
 */
const CREATE_ALLOWED_FIELDS = new Set([
  "name",
  "slug",
  "description",
  "categoryId",
  "subCategoryId",
  "basePrice",
  "discountPercentage",
  "attributes",
  "isFeatured",
  "active",
]);

const UPDATE_ALLOWED_FIELDS = new Set([
  "name",
  "slug",
  "description",
  "subCategoryId",
  "basePrice",
  "discountPercentage",
  "attributes",
  "isFeatured",
  "active",
]);

/** A bulk row: a create without its category, which the payload gives once. */
const BULK_ROW_ALLOWED_FIELDS = new Set(
  [...CREATE_ALLOWED_FIELDS].filter((field) => field !== "categoryId"),
);

export const MAX_BULK_PRODUCTS = 1000;

const unknownFieldMessage = (field) => {
  if (field === "categoryId") {
    return "categoryId cannot be set here — move products with bulkUpdateCategory";
  }

  if (field === "sizeChartId") {
    return "sizeChartId is not a product field — the size chart follows attributes.fit";
  }

  return `Field "${field}" is not allowed`;
};

const collectUnknownFields = (body, allowed) => {
  const errors = {};
  for (const field of Object.keys(body)) {
    if (!allowed.has(field)) errors[field] = unknownFieldMessage(field);
  }
  return errors;
};

/**
 * Every rule a new product is held to, as a field -> message map.
 *
 * Shared by the single create and by each row of the bulk create, so the
 * spreadsheet path cannot become the way round the form's rules. It was:
 * a bulk row skipped the slug pattern, the uuid checks, the type checks
 * and the length limits, and reached Postgres as a 500.
 *
 * @param {object} body
 * @param {{requireCategory?: boolean, allowed?: Set<string>}} [options]
 * @returns {Record<string, string>} empty when the product is valid
 */
export const collectCreateProductErrors = (
  body,
  { requireCategory = true, allowed = CREATE_ALLOWED_FIELDS } = {},
) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { product: "Product must be an object" };
  }

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
  } = body;

  const errors = collectUnknownFields(body, allowed);

  const nameError = validateProductName(name, true);
  if (nameError) errors.name = nameError;

  const slugError = validateProductSlug(slug, true);
  if (slugError) errors.slug = slugError;

  const descriptionError = validateProductDescription(description);
  if (descriptionError) errors.description = descriptionError;

  if (requireCategory) {
    const categoryIdError = validateProductCategoryId(categoryId, true);
    if (categoryIdError) errors.categoryId = categoryIdError;
  }

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

  return errors;
};

/** A body that passed collectCreateProductErrors, in the shape it is stored. */
export const normalizeCreateProduct = (body) => {
  const out = {
    name: body.name.trim(),
    slug: body.slug.trim().toLowerCase(),
    description:
      typeof body.description === "string" ? body.description.trim() : null,
    subCategoryId: body.subCategoryId ? String(body.subCategoryId).trim() : null,
    basePrice: Number(body.basePrice),
    discountPercentage:
      body.discountPercentage !== undefined &&
      body.discountPercentage !== null &&
      body.discountPercentage !== ""
        ? Number(body.discountPercentage)
        : 0,
    attributes: normalizeProductAttributes(body.attributes),
    isFeatured: normalizeBoolean(body.isFeatured) ?? false,
    active: normalizeBoolean(body.active) ?? true,
  };

  if (body.categoryId !== undefined) {
    out.categoryId = String(body.categoryId).trim();
  }

  return out;
};

export const validateCreateProduct = (req, res, next) => {
  try {
    const body = req.body ?? {};
    const errors = collectCreateProductErrors(body);

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

    req.body = normalizeCreateProduct(body);

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * `{ categoryId, products: [...] }`, every row held to the single
 * create's rules.
 *
 * Every row is checked before anything is refused, and the errors come
 * back keyed `products[i].field`, so a spreadsheet of a thousand rows is
 * fixed in one pass rather than one 400 at a time. A slug repeated inside
 * the payload is caught here too: Postgres would refuse the whole insert
 * over it and name only one of the rows.
 *
 * Collected by a pure function so the rules can be tested without a
 * request; the middleware below is a thin wrapper.
 *
 * @returns {{errors: Record<string,string>, rowsWithErrors: number}}
 */
export const collectBulkCreateErrors = (body) => {
  const source = body ?? {};
  const { categoryId, products } = source;
  const errors = collectUnknownFields(
    source,
    new Set(["categoryId", "products"]),
  );

  const categoryIdError = validateProductCategoryId(categoryId, true);
  if (categoryIdError) errors.categoryId = categoryIdError;

  if (!Array.isArray(products) || products.length === 0) {
    errors.products = "products must be a non-empty array";
    return { errors, rowsWithErrors: 0 };
  }

  if (products.length > MAX_BULK_PRODUCTS) {
    errors.products = `Maximum ${MAX_BULK_PRODUCTS} products can be created in bulk`;
    return { errors, rowsWithErrors: 0 };
  }

  const firstRowBySlug = new Map();
  let rowsWithErrors = 0;

  products.forEach((row, index) => {
    const rowErrors = collectCreateProductErrors(row, {
      requireCategory: false,
      allowed: BULK_ROW_ALLOWED_FIELDS,
    });

    if (!rowErrors.slug && typeof row?.slug === "string") {
      const slug = row.slug.trim().toLowerCase();
      const first = firstRowBySlug.get(slug);

      if (first !== undefined) {
        rowErrors.slug = `Slug "${slug}" is also used by products[${first}]`;
      } else {
        firstRowBySlug.set(slug, index);
      }
    }

    const entries = Object.entries(rowErrors);
    if (entries.length > 0) rowsWithErrors += 1;

    for (const [field, message] of entries) {
      errors[`products[${index}].${field}`] = message;
    }
  });

  return { errors, rowsWithErrors };
};

export const validateBulkCreateProducts = (req, res, next) => {
  try {
    const body = req.body ?? {};
    const { errors, rowsWithErrors } = collectBulkCreateErrors(body);

    if (Object.keys(errors).length > 0) {
      const total = Array.isArray(body.products) ? body.products.length : 0;

      throw new ApiError(
        400,
        rowsWithErrors > 0
          ? `Validation failed in ${rowsWithErrors} of ${total} product${total === 1 ? "" : "s"}`
          : "Validation failed",
        errors,
      );
    }

    req.body = {
      categoryId: String(body.categoryId).trim(),
      products: body.products.map(normalizeCreateProduct),
    };

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

    const unknown = collectUnknownFields(body, UPDATE_ALLOWED_FIELDS);
    if (Object.keys(unknown).length > 0) {
      throw new ApiError(400, "Validation failed", unknown);
    }

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
