// src/validators/customer_story.validator.js
//
// What customers have sent the shop (F-06.08). Shape checks only.
//
// There is no customer_story.rules.js beside this file. A story has
// three typed fields and two of them are optional strings; a rules
// module quoting a policy would be three indirections over a length
// check. The bounds still come from config/customer_story.policy.js,
// imported directly, so this file and the CHECK constraints in 018 are
// quoting one source.
//
// What is *not* decided here: whether the row ends up with content at
// all. A create carrying files gets its content from the files, an edit
// gets it from what the story already has, and neither is visible from
// the body alone — see the service, which is where the "a picture, or
// some words, or both" rule is enforced.

import { ApiError } from "../utils/ApiError.js";
import {
  MAX_BODY_LENGTH,
  MAX_NAME_LENGTH,
  MAX_STORIES_PER_UPLOAD,
} from "../config/customer_story.policy.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const blank = (value) =>
  value === undefined || value === null || String(value).trim() === "";

export const validateStoryIdParam = (req, res, next) => {
  const id = String(req.params?.id ?? "").trim();

  if (!UUID_REGEX.test(id)) {
    throw new ApiError(400, "Invalid story ID format");
  }

  req.params.id = id;

  next();
};

/**
 * The typed fields of a story: who said it, what they said, and which
 * piece it is about.
 *
 * All three are optional here, and all three are shared by every write
 * that carries JSON — the text-only create and the edit. What differs
 * between those two is whether the result may be empty, and that is the
 * service's question rather than this one's.
 *
 * The fields are normalised in place: trimmed, and turned into null when
 * they are blank. A story whose name is "   " must reach the database as
 * NULL rather than as a byline with nothing in it, and doing that here
 * means every path downstream sees one shape.
 */
const validateStoryFields = (body) => {
  const errors = {};

  // --- customerName ---------------------------------------------------------

  if (!blank(body.customerName)) {
    if (typeof body.customerName !== "string") {
      errors.customerName = "A name must be text";
    } else if (body.customerName.trim().length > MAX_NAME_LENGTH) {
      errors.customerName = `A name must not exceed ${MAX_NAME_LENGTH} characters`;
    } else {
      body.customerName = body.customerName.trim();
    }
  } else {
    body.customerName = null;
  }

  // --- body -----------------------------------------------------------------

  if (!blank(body.body)) {
    if (typeof body.body !== "string") {
      errors.body = "A quote must be text";
    } else if (body.body.trim().length > MAX_BODY_LENGTH) {
      errors.body = `A quote must not exceed ${MAX_BODY_LENGTH} characters. Publish the part worth reading.`;
    } else {
      body.body = body.body.trim();
    }
  } else {
    body.body = null;
  }

  // --- productId ------------------------------------------------------------

  if (!blank(body.productId)) {
    if (
      typeof body.productId !== "string" ||
      !UUID_REGEX.test(body.productId.trim())
    ) {
      errors.productId = "That is not a valid product ID";
    } else {
      body.productId = body.productId.trim();
    }
  } else {
    body.productId = null;
  }

  return errors;
};

/**
 * A story typed rather than uploaded — one quote, no photograph.
 *
 * The one field this insists on is `body`. A story with no image and no
 * words is nothing at all, and the row would be refused by the CHECK in
 * 018 with a message about a constraint rather than about a quote.
 */
export const validateCreateStory = (req, res, next) => {
  const body = req.body ?? {};

  const errors = validateStoryFields(body);

  if (!errors.body && blank(body.body)) {
    errors.body = "Type the quote, or upload a photograph instead";
  }

  if (Object.keys(errors).length) {
    throw new ApiError(400, "Validation failed", errors);
  }

  req.body = body;

  next();
};

/**
 * An edit of a story's typed fields.
 *
 * A full replace of the three, not a patch: clearing a name and leaving
 * it alone are different edits, and a body that omitted the field could
 * not tell them apart. An empty body is allowed here because the story
 * may be carrying a photograph — whether what is left amounts to a story
 * is checked by the service, which can see the row.
 */
export const validateUpdateStory = (req, res, next) => {
  const body = req.body ?? {};

  const errors = validateStoryFields(body);

  if (Object.keys(errors).length) {
    throw new ApiError(400, "Validation failed", errors);
  }

  req.body = body;

  next();
};

/**
 * A batch of photographs.
 *
 * Runs after multer and after validateUploadedImages, so every buffer
 * has already been checked against its magic bytes. What is left to say
 * is that there is at least one: multer is happy with a multipart body
 * carrying no files, and without this the service would be asked to
 * create nothing.
 */
export const validateStoryUpload = (req, res, next) => {
  const files = req.files;

  if (!Array.isArray(files) || files.length === 0) {
    throw new ApiError(400, "Validation failed", {
      images: "Choose at least one photograph",
    });
  }

  if (files.length > MAX_STORIES_PER_UPLOAD) {
    throw new ApiError(400, "Validation failed", {
      images: `At most ${MAX_STORIES_PER_UPLOAD} photographs can be uploaded at once`,
    });
  }

  next();
};

/** A single replacement photograph. */
export const validateStoryImage = (req, res, next) => {
  if (!req.file) {
    throw new ApiError(400, "Validation failed", {
      image: "Choose the photograph to replace this one with",
    });
  }

  next();
};

/** The toggle in the admin row: `{ published: boolean }`, and nothing else. */
export const validateSetPublished = (req, res, next) => {
  if (typeof req.body?.published !== "boolean") {
    throw new ApiError(400, "Validation failed", {
      published:
        req.body?.published === undefined
          ? "Published is required"
          : "Published must be true or false",
    });
  }

  next();
};

/**
 * A reorder: `{ ids: [...] }`, in the order the cards should be shown.
 *
 * Every id is required to be a UUID here; that it is the *complete* set
 * is the service's check, because only the service can see how many
 * there are.
 */
export const validateReorder = (req, res, next) => {
  const ids = req.body?.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(400, "Validation failed", {
      ids: "Send the story ids in the order they should be shown",
    });
  }

  const seen = new Set();

  for (const id of ids) {
    if (typeof id !== "string" || !UUID_REGEX.test(id.trim())) {
      throw new ApiError(400, "Validation failed", {
        ids: `'${id}' is not a valid story ID`,
      });
    }

    if (seen.has(id.trim())) {
      throw new ApiError(400, "Validation failed", {
        ids: "The same story is listed twice",
      });
    }

    seen.add(id.trim());
  }

  req.body.ids = ids.map((id) => id.trim());

  next();
};
