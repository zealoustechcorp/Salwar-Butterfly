// src/middlewares/upload.middleware.js

import multer from "multer";

import { ApiError } from "../utils/ApiError.js";
import { MAX_BANNERS_PER_UPLOAD } from "../config/banner.policy.js";
import { MAX_STORIES_PER_UPLOAD } from "../config/customer_story.policy.js";

// ============================================================
// CONFIGURATION
// ============================================================

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const MAX_FILES = 1;

// A product is photographed several times over — front, back, drape,
// fabric — so its gallery accepts a batch where a category's single
// cover image does not. Matches MAX_IMAGES_PER_PRODUCT in the service,
// which is what actually enforces the per-product ceiling; this only
// bounds one request.
const MAX_PRODUCT_IMAGES = 8;

// The batch instance below is shared by the product gallery, the home
// page carousel and the customer stories, so its ceiling is whichever of
// the three wants most. Held as the max rather than as a number, because
// a `files` limit lower than what a route's `.array()` asks for refuses
// the extra files with a count multer got from the instance and a
// message the route wrote — two different numbers for one refusal.
const MAX_BATCH_FILES = Math.max(
  MAX_PRODUCT_IMAGES,
  MAX_BANNERS_PER_UPLOAD,
  MAX_STORIES_PER_UPLOAD,
);

// ============================================================
// MULTER STORAGE
// ============================================================
//
// Store the uploaded image in memory.
//
// The buffer will later be sent directly to Cloudinary.
//

const storage = multer.memoryStorage();

// ============================================================
// INITIAL MIME TYPES
// ============================================================
//
// Browsers/Postman may send different MIME types for the same
// image. Therefore we DO NOT completely trust file.mimetype.
//
// We only use it as preliminary information.
//
// The actual file content is validated later using magic bytes.
//

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",

  // Some clients/Postman may send this for image files.
  "application/octet-stream",
]);

// ============================================================
// FILE FILTER
// ============================================================

const fileFilter = (req, file, callback) => {
  if (!file) {
    return callback(new ApiError(400, "Image file is required"), false);
  }

  // ----------------------------------------------------------
  // Do not reject application/octet-stream here.
  // Actual image content will be checked using magic bytes.
  // ----------------------------------------------------------

  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return callback(
      new ApiError(
        400,
        `Invalid image MIME type: ${file.mimetype}. Only JPEG, PNG and WebP images are allowed.`,
      ),
      false,
    );
  }

  callback(null, true);
};

// ============================================================
// MULTER INSTANCE
// ============================================================

const upload = multer({
  storage,

  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
  },

  fileFilter,
});

// Same storage, same filter, a higher file count. A second instance
// rather than raising `files` on the shared one: the single-image routes
// rely on multer refusing a second file outright.
const uploadMany = multer({
  storage,

  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_BATCH_FILES,
  },

  fileFilter,
});

// ============================================================
// IMAGE SIGNATURE VALIDATION
// ============================================================
//
// MIME type supplied by the client cannot be trusted.
//
// These functions inspect the actual binary contents of the
// uploaded file.
//

const isJPEG = (buffer) => {
  if (!buffer || buffer.length < 3) {
    return false;
  }

  return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
};

// ------------------------------------------------------------

const isPNG = (buffer) => {
  if (!buffer || buffer.length < 8) {
    return false;
  }

  return (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
};

// ------------------------------------------------------------

const isWEBP = (buffer) => {
  if (!buffer || buffer.length < 12) {
    return false;
  }

  return (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
};

// ============================================================
// DETECT IMAGE TYPE
// ============================================================

const detectImageType = (buffer) => {
  if (isJPEG(buffer)) {
    return "image/jpeg";
  }

  if (isPNG(buffer)) {
    return "image/png";
  }

  if (isWEBP(buffer)) {
    return "image/webp";
  }

  return null;
};

// ============================================================
// VALIDATE UPLOADED IMAGE
// ============================================================
//
// This middleware runs AFTER multer.
//
// At this point req.file.buffer is available.
//

export const validateUploadedImage = (req, res, next) => {
  // ----------------------------------------------------------
  // No image
  // ----------------------------------------------------------

  if (!req.file) {
    return next();
  }

  // ----------------------------------------------------------
  // Validate buffer
  // ----------------------------------------------------------

  if (!Buffer.isBuffer(req.file.buffer)) {
    return next(new ApiError(400, "Uploaded image could not be read"));
  }

  // ----------------------------------------------------------
  // Detect actual image type
  // ----------------------------------------------------------

  const detectedMimeType = detectImageType(req.file.buffer);

  // ----------------------------------------------------------
  // Invalid image
  // ----------------------------------------------------------

  if (!detectedMimeType) {
    return next(
      new ApiError(
        400,
        "Invalid image file. Only JPEG, PNG and WebP images are allowed.",
      ),
    );
  }

  // ----------------------------------------------------------
  // Store verified MIME type
  // ----------------------------------------------------------

  req.file.detectedMimeType = detectedMimeType;

  // ----------------------------------------------------------
  // Normalize MIME type
  // ----------------------------------------------------------

  req.file.mimetype = detectedMimeType;

  next();
};

// ============================================================
// CATEGORY IMAGE UPLOAD
// ============================================================
//
// Expected multipart/form-data:
//
// image = File
//
// Example:
//
// uploadCategoryImage
// validateUploadedImage
//

export const uploadCategoryImage = upload.single("image");

// ============================================================
// PRODUCT IMAGE UPLOAD
// ============================================================
//
// Expected multipart/form-data:
//
// images   = File (repeat the field for each image, up to 8)
// altText  = String (optional, repeated positionally against the files)
//
// Example:
//
// uploadProductImages
// validateUploadedImages
//

export const uploadProductImages = uploadMany.array(
  "images",
  MAX_PRODUCT_IMAGES,
);

// ============================================================
// BANNER IMAGE UPLOAD
// ============================================================
//
// The home page carousel (F-06). Two routes, two shapes.
//
// Adding is a batch: a season's artwork is finished together and dragged
// in together, and the admin screen's whole create form is a file
// picker. Replacing is one file, because it swaps the artwork on one
// slide that already exists.
//
// Expected multipart/form-data:
//
// images = File (repeat the field for each banner, up to the policy's
//                MAX_BANNERS_PER_UPLOAD)
//
// Example:
//
// uploadBannerImages
// handleBannerUploadError
// validateUploadedImages
//

export const uploadBannerImages = uploadMany.array(
  "images",
  MAX_BANNERS_PER_UPLOAD,
);

/**
 * The single-file variant, for replacing one slide's artwork.
 *
 * Built on `upload` rather than `uploadMany`: the single-image routes
 * rely on multer refusing a second file outright, which is the whole
 * reason there are two instances.
 */
export const uploadBannerImage = upload.single("image");

// ============================================================
// CUSTOMER STORY IMAGE UPLOAD
// ============================================================
//
// What customers have sent the shop (F-06.08). The same two shapes as
// the banners, and for the same reasons: a batch to add, one file to
// replace.
//
// Expected multipart/form-data:
//
// images = File (repeat the field for each story, up to the policy's
//                MAX_STORIES_PER_UPLOAD)
//
// A story created this way carries nothing but its photograph. The name
// and the quote are typed afterwards, on the few that have one.
//

export const uploadStoryImages = uploadMany.array(
  "images",
  MAX_STORIES_PER_UPLOAD,
);

/**
 * The single-file variant, for replacing one story's photograph — or
 * giving one to a story that was words alone.
 */
export const uploadStoryImage = upload.single("image");

// ============================================================
// VALIDATE UPLOADED IMAGES (MULTIPLE)
// ============================================================
//
// The array counterpart of validateUploadedImage. Every file is checked
// by its magic bytes, and one bad file rejects the whole batch — a
// partial upload would leave the admin guessing which of the six photos
// they selected actually landed.
//

export const validateUploadedImages = (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next();
  }

  for (const [index, file] of req.files.entries()) {
    const position = index + 1;

    if (!Buffer.isBuffer(file.buffer)) {
      return next(
        new ApiError(400, `Image ${position} could not be read`),
      );
    }

    const detectedMimeType = detectImageType(file.buffer);

    if (!detectedMimeType) {
      return next(
        new ApiError(
          400,
          `Image ${position} (${file.originalname || "unnamed"}) is not a valid image. Only JPEG, PNG and WebP are allowed.`,
        ),
      );
    }

    file.detectedMimeType = detectedMimeType;
    file.mimetype = detectedMimeType;
  }

  next();
};

// ============================================================
// MULTER ERROR HANDLER
// ============================================================

/**
 * Builds the multer error handler for one route.
 *
 * The limits are passed in rather than read off the error, because multer
 * reports LIMIT_FILE_COUNT with no `field` — there is nothing on the
 * error itself that says whether the route wanted one cover image or a
 * gallery of eight, and getting that wrong tells the admin to remove
 * files they never sent.
 *
 * @param {object} [config]
 * @param {number} [config.maxFiles]  how many files this route accepts
 * @param {string} [config.field]     the multipart field name it reads
 */
export const uploadErrorHandler =
  ({ maxFiles = MAX_FILES, field = "image" } = {}) =>
  (error, req, res, next) => {
    if (!error) {
      return next();
    }

    // ----------------------------------------------------------
    // FILE SIZE
    // ----------------------------------------------------------

    if (
      error instanceof multer.MulterError &&
      error.code === "LIMIT_FILE_SIZE"
    ) {
      return next(new ApiError(400, "Image size must not exceed 5 MB"));
    }

    // ----------------------------------------------------------
    // FILE COUNT
    // ----------------------------------------------------------

    if (
      error instanceof multer.MulterError &&
      error.code === "LIMIT_FILE_COUNT"
    ) {
      return next(
        new ApiError(
          400,
          maxFiles === 1
            ? "Only one image can be uploaded"
            : `At most ${maxFiles} images can be uploaded at once`,
        ),
      );
    }

    // ----------------------------------------------------------
    // UNEXPECTED FILE
    // ----------------------------------------------------------

    if (
      error instanceof multer.MulterError &&
      error.code === "LIMIT_UNEXPECTED_FILE"
    ) {
      return next(
        new ApiError(
          400,
          `Unexpected file field "${error.field ?? "unknown"}". Use field name "${field}".`,
        ),
      );
    }

    // ----------------------------------------------------------
    // OTHER MULTER ERRORS
    // ----------------------------------------------------------

    if (error instanceof multer.MulterError) {
      return next(new ApiError(400, `Image upload error: ${error.code}`));
    }

    // ----------------------------------------------------------
    // CUSTOM API ERROR
    // ----------------------------------------------------------

    next(error);
  };

/** The single-cover-image default, for the category routes. */
export const handleUploadError = uploadErrorHandler();

/** The gallery variant, for the product image route. */
export const handleProductUploadError = uploadErrorHandler({
  maxFiles: MAX_PRODUCT_IMAGES,
  field: "images",
});

/**
 * The carousel variant, for the banner batch route.
 *
 * Its own handler rather than the product one despite both reading
 * `images`: the two ceilings are separate numbers that happen to agree
 * today, and sharing the handler would tell an admin uploading banners
 * about a limit named after products the moment one of them moves.
 */
export const handleBannerUploadError = uploadErrorHandler({
  maxFiles: MAX_BANNERS_PER_UPLOAD,
  field: "images",
});

/** The customer stories variant. Its own ceiling, for the same reason. */
export const handleStoryUploadError = uploadErrorHandler({
  maxFiles: MAX_STORIES_PER_UPLOAD,
  field: "images",
});
