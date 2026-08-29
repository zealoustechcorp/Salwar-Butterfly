// src/middlewares/upload.middleware.js

import multer from "multer";

import { ApiError } from "../utils/ApiError.js";

// ============================================================
// CONFIGURATION
// ============================================================

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const MAX_FILES = 1;

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
// MULTER ERROR HANDLER
// ============================================================

export const handleUploadError = (error, req, res, next) => {
  if (!error) {
    return next();
  }

  // ----------------------------------------------------------
  // FILE SIZE
  // ----------------------------------------------------------

  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return next(new ApiError(400, "Image size must not exceed 5 MB"));
  }

  // ----------------------------------------------------------
  // FILE COUNT
  // ----------------------------------------------------------

  if (
    error instanceof multer.MulterError &&
    error.code === "LIMIT_FILE_COUNT"
  ) {
    return next(new ApiError(400, "Only one image can be uploaded"));
  }

  // ----------------------------------------------------------
  // UNEXPECTED FILE
  // ----------------------------------------------------------

  if (
    error instanceof multer.MulterError &&
    error.code === "LIMIT_UNEXPECTED_FILE"
  ) {
    return next(
      new ApiError(400, 'Unexpected image field. Use field name "image".'),
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
