/**
 * Product images — the gallery behind every product.
 *
 * A product is sold on its photographs: front, back, drape, a fabric
 * close-up. They live in their own table, one row per image, ordered, so
 * this is its own client rather than fields on the product body.
 *
 * Two things worth knowing before calling anything here:
 *
 *   the cover is position 0
 *       There is no "primary" flag to set. The first image in the order
 *       is the cover, so `makeCover` is a reorder, not a separate write.
 *
 *   uploading needs a saved product
 *       Images are keyed by product id, so a product must exist before
 *       it can be photographed. The create screen stages files in the
 *       browser and uploads them once the product row is written.
 *
 * Errors are the `ApiError` thrown by the shared client.
 */

import { api } from "./client";

/** Matches MAX_IMAGES_PER_PRODUCT in the API. */
export const MAX_IMAGES = 8;

/** Matches the multer limit — 5 MB per file. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** What the API's magic-byte check will actually accept. */
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const ACCEPT_ATTRIBUTE = ".jpg,.jpeg,.png,.webp";

export function toImage(dto) {
  if (!dto) return null;

  return {
    id: String(dto.id),
    productId: dto.productId == null ? "" : String(dto.productId),
    url: dto.imageUrl ?? "",
    publicId: dto.imagePublicId ?? "",
    altText: dto.altText ?? "",
    position: Number(dto.position ?? 0),
    isPrimary: Boolean(dto.isPrimary),
  };
}

/**
 * Checks a file before it costs an upload.
 *
 * The API validates the same things by magic bytes, which is the check
 * that counts — this one only exists so picking a 12 MB TIFF says so
 * immediately instead of after the bytes are on the wire.
 *
 * @returns {string|null} the reason it was rejected, or null if it is fine
 */
export function rejectionReason(file) {
  if (!file) return "No file selected.";

  if (file.size > MAX_FILE_BYTES) {
    return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB.`;
  }

  // An empty type is not proof of a bad file (some browsers send nothing
  // for a drag-and-drop), so only a positively wrong type is rejected.
  if (file.type && !ACCEPTED_TYPES.includes(file.type)) {
    return `${file.name} is not a JPEG, PNG or WebP.`;
  }

  return null;
}

// ============================================================
// WRITE
// ============================================================
//
// There is no read function here on purpose. Every product read embeds
// its gallery (`images` and `primaryImage`, aggregated by the API), so a
// screen showing photographs already has them, and each write below
// returns the gallery it produced. `GET /productImages/...` exists on the
// API for tooling, but nothing in the UI needs it.

/**
 * Uploads files and appends them to the product's gallery.
 *
 * Sent as one multipart request rather than one per file, so a batch is
 * one round trip and either lands whole or leaves nothing behind — the
 * API rolls its own uploads back if the registration fails.
 *
 * @param {string} productId
 * @param {File[]} files
 * @param {string[]} [altTexts]  positional against `files`; blanks allowed
 * @returns {Promise<{images: Array, added: number}>}
 */
export async function uploadImages(
  productId,
  files,
  altTexts = [],
  { token } = {},
) {
  const body = new FormData();

  files.forEach((file, index) => {
    body.append("images", file);
    // Appended for every file, not only the ones with text, so the
    // API's positional pairing stays aligned with the files.
    body.append("altText", altTexts[index] ?? "");
  });

  const { data, meta } = await api.post(
    `/productImages/uploadProductImages/${encodeURIComponent(productId)}`,
    body,
    { token, envelope: true },
  );

  return {
    images: (data ?? []).map(toImage),
    added: meta?.added ?? files.length,
  };
}

/**
 * Saves the gallery order. Must list every image the product has — a
 * partial list is refused, because it would silently demote whatever was
 * left out.
 */
export async function reorderImages(productId, imageIds, { token } = {}) {
  const { data } = await api.put(
    `/productImages/reorderProductImages/${encodeURIComponent(productId)}`,
    { imageIds },
    { token, envelope: true },
  );

  return (data ?? []).map(toImage);
}

/**
 * Promotes one image to the cover by moving it to the front — there is
 * no primary flag, position 0 *is* the cover.
 */
export function makeCover(productId, imageId, images, options) {
  const rest = images
    .filter((image) => image.id !== imageId)
    .map((image) => image.id);

  return reorderImages(productId, [imageId, ...rest], options);
}

export async function updateImageAltText(imageId, altText, { token } = {}) {
  const data = await api.patch(
    `/productImages/updateProductImage/${encodeURIComponent(imageId)}`,
    { altText },
    { token },
  );

  return toImage(data);
}

/**
 * Removes one image, from the catalogue and from Cloudinary. The gap it
 * leaves is closed by the API, so deleting the cover promotes the next
 * image rather than leaving the product coverless.
 */
export async function deleteImage(imageId, { token } = {}) {
  await api.del(
    `/productImages/deleteProductImage/${encodeURIComponent(imageId)}`,
    { token },
  );

  return { id: imageId };
}
