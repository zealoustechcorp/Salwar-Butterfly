// src/validators/home_section.validator.js
//
// The two home page sections (F-06). Shape checks only; whether a section
// would grow past its limit is the service's question.
//
// Fields are normalised in place — trimmed, blanks turned into null — so
// everything downstream sees one shape.

import { ApiError } from "../utils/ApiError.js";
import {
  FIXED_SECTIONS,
  MAX_PRODUCTS_PER_SECTION,
  MAX_SUBTITLE_LENGTH,
  MAX_TITLE_LENGTH,
} from "../config/home_section.policy.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const blank = (value) =>
  value === undefined || value === null || String(value).trim() === "";

/** `:slug` — one of the two fixed sections. */
export const validateSectionSlugParam = (req, res, next) => {
  const slug = String(req.params?.slug ?? "").trim();

  if (!FIXED_SECTIONS.includes(slug)) {
    throw ApiError.notFound("Section not found", "HOME_SECTION_NOT_FOUND");
  }

  req.params.slug = slug;

  next();
};

/** `:productId` — a product UUID. */
export const validateProductIdParam = (req, res, next) => {
  const id = String(req.params?.productId ?? "").trim();

  if (!UUID_REGEX.test(id)) {
    throw new ApiError(400, "Invalid product ID format");
  }

  req.params.productId = id;

  next();
};

/**
 * One section, as the section page saves it — a full replace:
 *
 *   { title, subtitle?, productIds }
 *
 * `productIds` is the whole ordered list. An empty list is allowed: an
 * empty section is simply not drawn on the home page, which is how it is
 * hidden.
 */
export const validateSectionBody = (req, res, next) => {
  const body = req.body ?? {};
  const errors = {};

  if (blank(body.title) || typeof body.title !== "string") {
    errors.title = "Give the section a name";
  } else if (body.title.trim().length > MAX_TITLE_LENGTH) {
    errors.title = `A name must not exceed ${MAX_TITLE_LENGTH} characters`;
  }

  let subtitle = null;
  if (!blank(body.subtitle)) {
    if (typeof body.subtitle !== "string") {
      errors.subtitle = "The description must be text";
    } else if (body.subtitle.trim().length > MAX_SUBTITLE_LENGTH) {
      errors.subtitle = `The description must not exceed ${MAX_SUBTITLE_LENGTH} characters`;
    } else {
      subtitle = body.subtitle.trim();
    }
  }

  const ids = body.productIds ?? [];
  const seen = new Set();

  if (!Array.isArray(ids)) {
    errors.productIds = "Send the picked pieces as a list";
  } else if (ids.length > MAX_PRODUCTS_PER_SECTION) {
    errors.productIds = `A section holds at most ${MAX_PRODUCTS_PER_SECTION} pieces`;
  } else {
    for (const id of ids) {
      const trimmed = typeof id === "string" ? id.trim() : "";

      if (!UUID_REGEX.test(trimmed)) {
        errors.productIds = `'${id}' is not a valid product ID`;
        break;
      }

      if (seen.has(trimmed)) {
        errors.productIds = "The same piece is picked twice";
        break;
      }

      seen.add(trimmed);
    }
  }

  if (Object.keys(errors).length) {
    throw new ApiError(400, "Validation failed", errors);
  }

  req.body = {
    title: body.title.trim(),
    subtitle,
    productIds: [...seen],
  };

  next();
};

/**
 * Which sections one product is in, as the product page's checkboxes send
 * it: `{ sections: ["best-sellers"] }`. An empty list takes it out of both.
 */
export const validateProductSections = (req, res, next) => {
  const sections = req.body?.sections;

  if (!Array.isArray(sections)) {
    throw new ApiError(400, "Validation failed", {
      sections: "Send the sections as a list",
    });
  }

  for (const slug of sections) {
    if (!FIXED_SECTIONS.includes(slug)) {
      throw new ApiError(400, "Validation failed", {
        sections: `'${slug}' is not a home page section`,
      });
    }
  }

  req.body = { sections: [...new Set(sections)] };

  next();
};
