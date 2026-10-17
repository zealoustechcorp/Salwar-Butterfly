// src/validators/home_section.validator.js
//
// The hand-picked shelves on the home page (F-06). Shape checks only;
// whether the table has room, and whether a slug is already taken, are the
// service's questions.
//
// Fields are normalised in place — trimmed, blanks turned into null, the
// slug derived from the title when none is sent — so everything downstream
// sees one shape.

import { ApiError } from "../utils/ApiError.js";
import {
  LAYOUTS,
  THEMES,
  MAX_PRODUCTS_PER_SECTION,
  MAX_SLUG_LENGTH,
  MAX_SUBTITLE_LENGTH,
  MAX_TITLE_LENGTH,
  SLUG_PATTERN,
} from "../config/home_section.policy.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const blank = (value) =>
  value === undefined || value === null || String(value).trim() === "";

/** "Diwali Sale 2026!" → "diwali-sale-2026". */
export const slugify = (text) =>
  String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");

/** An ISO date-time, or null for an open end. Undefined means invalid. */
const toTimestamp = (value) => {
  if (blank(value)) return null;
  if (typeof value !== "string") return undefined;

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

export const validateSectionIdParam = (req, res, next) => {
  const id = String(req.params?.id ?? "").trim();

  if (!UUID_REGEX.test(id)) {
    throw new ApiError(400, "Invalid section ID format");
  }

  req.params.id = id;

  next();
};

/**
 * A shelf as create and update both send it — a full replace:
 *
 *   { title, subtitle?, slug?, startsAt?, endsAt?, active?, layout?,
 *     theme?, productIds }
 *
 * `active` defaults to true, so a shelf saved without touching the switch
 * goes live (inside its window). `productIds` is the whole ordered list;
 * an empty list is allowed, so a festival shelf can be set up before its
 * pieces are photographed. The storefront does not show an empty shelf.
 */
export const validateSectionBody = (req, res, next) => {
  const body = req.body ?? {};
  const errors = {};

  // --- title ----------------------------------------------------------------

  if (blank(body.title) || typeof body.title !== "string") {
    errors.title = "Give the shelf a title";
  } else if (body.title.trim().length > MAX_TITLE_LENGTH) {
    errors.title = `A title must not exceed ${MAX_TITLE_LENGTH} characters`;
  } else {
    body.title = body.title.trim();
  }

  // --- subtitle -------------------------------------------------------------

  if (blank(body.subtitle)) {
    body.subtitle = null;
  } else if (typeof body.subtitle !== "string") {
    errors.subtitle = "The line under the title must be text";
  } else if (body.subtitle.trim().length > MAX_SUBTITLE_LENGTH) {
    errors.subtitle = `The line under the title must not exceed ${MAX_SUBTITLE_LENGTH} characters`;
  } else {
    body.subtitle = body.subtitle.trim();
  }

  // --- slug -----------------------------------------------------------------
  //
  // Derived from the title when left blank. A title with no Latin letters
  // or digits (a Tamil-only title, say) derives nothing, and is asked for
  // one rather than given a meaningless id.

  if (blank(body.slug)) {
    body.slug = errors.title ? null : slugify(body.title);

    if (!errors.title && !body.slug) {
      errors.slug =
        "Type a link name in English letters or numbers, e.g. diwali-sale";
    }
  } else if (typeof body.slug !== "string") {
    errors.slug = "The link name must be text";
  } else {
    const slug = body.slug.trim().toLowerCase();

    if (slug.length > MAX_SLUG_LENGTH) {
      errors.slug = `The link name must not exceed ${MAX_SLUG_LENGTH} characters`;
    } else if (!SLUG_PATTERN.test(slug)) {
      errors.slug =
        "Use lower-case letters, numbers and single hyphens only, e.g. diwali-sale-2026";
    } else {
      body.slug = slug;
    }
  }

  // --- window ---------------------------------------------------------------

  const startsAt = toTimestamp(body.startsAt);
  const endsAt = toTimestamp(body.endsAt);

  if (startsAt === undefined) errors.startsAt = "That is not a valid start date";
  if (endsAt === undefined) errors.endsAt = "That is not a valid end date";

  if (startsAt && endsAt && endsAt <= startsAt) {
    errors.endsAt = "The end must be after the start";
  }

  body.startsAt = startsAt ?? null;
  body.endsAt = endsAt ?? null;

  // --- active ---------------------------------------------------------------

  if (body.active === undefined) {
    body.active = true;
  } else if (typeof body.active !== "boolean") {
    errors.active = "Active must be true or false";
  }

  // --- layout and theme -----------------------------------------------------

  if (blank(body.layout)) {
    body.layout = "cards";
  } else if (!LAYOUTS.includes(body.layout)) {
    errors.layout = `Layout must be one of: ${LAYOUTS.join(", ")}`;
  }

  if (blank(body.theme)) {
    body.theme = THEMES[0];
  } else if (!THEMES.includes(body.theme)) {
    errors.theme = `Theme must be one of: ${THEMES.join(", ")}`;
  }

  // --- productIds -----------------------------------------------------------

  const ids = body.productIds ?? [];

  if (!Array.isArray(ids)) {
    errors.productIds = "Send the picked pieces as a list";
  } else if (ids.length > MAX_PRODUCTS_PER_SECTION) {
    errors.productIds = `A shelf holds at most ${MAX_PRODUCTS_PER_SECTION} pieces`;
  } else {
    const seen = new Set();

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

    if (!errors.productIds) body.productIds = [...seen];
  }

  if (Object.keys(errors).length) {
    throw new ApiError(400, "Validation failed", errors);
  }

  req.body = {
    title: body.title,
    subtitle: body.subtitle,
    slug: body.slug,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    active: body.active,
    layout: body.layout,
    theme: body.theme,
    productIds: body.productIds,
  };

  next();
};

/** The switch in the admin row: `{ active: boolean }`. */
export const validateSetActive = (req, res, next) => {
  if (typeof req.body?.active !== "boolean") {
    throw new ApiError(400, "Validation failed", {
      active:
        req.body?.active === undefined
          ? "Active is required"
          : "Active must be true or false",
    });
  }

  next();
};

/**
 * A reorder: `{ ids: [...] }`, top shelf first. That it is the complete
 * set is the service's check.
 */
export const validateReorder = (req, res, next) => {
  const ids = req.body?.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(400, "Validation failed", {
      ids: "Send the section ids in the order they should be shown",
    });
  }

  const seen = new Set();

  for (const id of ids) {
    if (typeof id !== "string" || !UUID_REGEX.test(id.trim())) {
      throw new ApiError(400, "Validation failed", {
        ids: `'${id}' is not a valid section ID`,
      });
    }

    if (seen.has(id.trim())) {
      throw new ApiError(400, "Validation failed", {
        ids: "The same section is listed twice",
      });
    }

    seen.add(id.trim());
  }

  req.body.ids = [...seen];

  next();
};
