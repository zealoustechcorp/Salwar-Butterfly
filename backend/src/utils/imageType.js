// src/utils/imageType.js
//
// What an image actually is, read from its first bytes.
//
// Two callers, one answer: upload.middleware.js uses it to refuse a file
// that is not an image whatever its MIME type claims, and r2.storage.js
// uses it to name the object and set the Content-Type the CDN will serve.
// Keeping both on the same function means a format accepted at the door
// is always one storage knows how to label.

const isJPEG = (buffer) =>
  buffer.length >= 3 &&
  buffer[0] === 0xff &&
  buffer[1] === 0xd8 &&
  buffer[2] === 0xff;

const isPNG = (buffer) =>
  buffer.length >= 8 &&
  buffer[0] === 0x89 &&
  buffer[1] === 0x50 &&
  buffer[2] === 0x4e &&
  buffer[3] === 0x47 &&
  buffer[4] === 0x0d &&
  buffer[5] === 0x0a &&
  buffer[6] === 0x1a &&
  buffer[7] === 0x0a;

const isWEBP = (buffer) =>
  buffer.length >= 12 &&
  buffer.toString("ascii", 0, 4) === "RIFF" &&
  buffer.toString("ascii", 8, 12) === "WEBP";

/** File extension for each MIME type detectImageType can return. */
export const IMAGE_EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
});

/**
 * @param {Buffer} buffer
 * @returns {"image/jpeg" | "image/png" | "image/webp" | null}
 */
export const detectImageType = (buffer) => {
  if (!Buffer.isBuffer(buffer)) return null;

  if (isJPEG(buffer)) return "image/jpeg";
  if (isPNG(buffer)) return "image/png";
  if (isWEBP(buffer)) return "image/webp";

  return null;
};
