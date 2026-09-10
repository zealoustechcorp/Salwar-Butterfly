// src/validators/banner.validator.js
//
// The home page carousel (F-06). Shape checks only.
//
// There is no banner.rules.js beside this file, unlike the size charts.
// A banner has no fields an admin types — the body of a create is the
// files themselves, and the only two writes that carry JSON are a
// boolean and a list of ids. A rules module quoting a policy would be
// three indirections over `typeof value === "boolean"`.
//
// What a banner may *be* — how many, which folder — is
// config/banner.policy.js, and the service is what enforces it, because
// only the service can count the rows already in the table.

import { ApiError } from "../utils/ApiError.js";
import { MAX_BANNERS_PER_UPLOAD } from "../config/banner.policy.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const validateBannerIdParam = (req, res, next) => {
  const id = String(req.params?.id ?? "").trim();

  if (!UUID_REGEX.test(id)) {
    throw new ApiError(400, "Invalid banner ID format");
  }

  req.params.id = id;

  next();
};

/**
 * A batch upload: at least one file, at most the policy's ceiling.
 *
 * Runs after multer and after validateUploadedImages, so by the time
 * this sees `req.files` every buffer has already been checked against
 * its magic bytes. What is left to say is that there is at least one —
 * multer is happy with a multipart body carrying no files at all, and
 * without this the service would be asked to create nothing and would
 * answer "0 banners created", which reads as a bug rather than as an
 * empty file picker.
 *
 * The ceiling is checked here as well as by multer's `files` limit.
 * Multer refuses a ninth file with LIMIT_FILE_COUNT, which the upload
 * error handler turns into a sentence; this catches the case where that
 * limit is ever raised without this one being looked at.
 */
export const validateBannerUpload = (req, res, next) => {
  const files = req.files;

  if (!Array.isArray(files) || files.length === 0) {
    throw new ApiError(400, "Validation failed", {
      images: "Choose at least one banner image",
    });
  }

  if (files.length > MAX_BANNERS_PER_UPLOAD) {
    throw new ApiError(400, "Validation failed", {
      images: `At most ${MAX_BANNERS_PER_UPLOAD} banners can be uploaded at once`,
    });
  }

  next();
};

/**
 * A single replacement image, for swapping one slide's artwork without
 * losing its place in the order.
 *
 * `req.file` rather than `req.files`: this route is wired to multer's
 * single-file instance, which refuses a second file outright.
 */
export const validateBannerImage = (req, res, next) => {
  if (!req.file) {
    throw new ApiError(400, "Validation failed", {
      image: "Choose the image to replace this banner with",
    });
  }

  next();
};

/** The toggle in the admin row: `{ active: boolean }`, and nothing else. */
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
 * A reorder: `{ ids: [...] }`, in the order the slides should rotate.
 *
 * Every id is required to be a UUID here; that it is the *complete* set
 * of banners is the service's check, because only the service can see
 * how many there are. A partial list would renumber the ones it names
 * from 1 and leave the rest sharing positions with them, which is not a
 * reorder — it is a carousel that settles somewhere nobody asked for.
 */
export const validateReorder = (req, res, next) => {
  const ids = req.body?.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(400, "Validation failed", {
      ids: "Send the banner ids in the order they should rotate",
    });
  }

  const seen = new Set();

  for (const id of ids) {
    if (typeof id !== "string" || !UUID_REGEX.test(id.trim())) {
      throw new ApiError(400, "Validation failed", {
        ids: `'${id}' is not a valid banner ID`,
      });
    }

    if (seen.has(id.trim())) {
      throw new ApiError(400, "Validation failed", {
        ids: "The same banner is listed twice",
      });
    }

    seen.add(id.trim());
  }

  req.body.ids = ids.map((id) => id.trim());

  next();
};
