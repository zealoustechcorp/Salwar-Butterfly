/**
 * The home page carousel (F-06), admin side.
 *
 * These are the photographs in the first fold of the storefront. They
 * were a frozen array of five Cloudinary URLs in `lib/store/shop.js`
 * until the `banners` table was created and seeded from exactly those
 * five, so what this module edits is the shop's existing banner set
 * rather than a new idea about the home page.
 *
 * Three things about the API worth knowing before calling it:
 *
 *   - **A banner is an image and a place in the order.** There is no
 *     title, subtitle, caption or link, on this side or the API's. The
 *     carousel renders each slide as decorative artwork beside the
 *     headline that already sits next to it, and the shop composes
 *     whatever it wants said into the picture.
 *   - **Creating takes a batch.** `createBanners` sends one multipart
 *     request carrying up to `MAX_PER_UPLOAD` files, because the gesture
 *     the shop actually makes is dragging a season's artwork in at once.
 *     Either the whole batch lands or none of it does — the API deletes
 *     its own uploads if the insert fails.
 *   - **Position is never sent.** New banners are appended by the API.
 *     The only thing that changes the order is `reorderBanners`, and it
 *     takes the whole set.
 *
 * Errors are the `ApiError` thrown by the shared client.
 */

import { api } from "./client";

/**
 * The most slides the carousel holds, live and hidden together.
 *
 * Mirrors MAX_BANNERS in backend/src/config/banner.policy.js. Held here
 * so the screen can grey out its own upload button rather than letting
 * the shop pick eight files and be told afterwards.
 */
export const MAX_BANNERS = 12;

/** Mirrors MAX_BANNERS_PER_UPLOAD. What one multipart request may carry. */
export const MAX_PER_UPLOAD = 8;

/** Matches the multer limit — 5 MB per file. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** What the API's magic-byte check will actually accept. */
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const ACCEPT_ATTRIBUTE = ".jpg,.jpeg,.png,.webp";

export function toBanner(dto) {
  if (!dto) return null;

  return {
    id: String(dto.id),
    image: dto.image ?? "",
    position: Number(dto.position ?? 0),
    active: Boolean(dto.active),
    createdAt: dto.createdAt ?? null,
    updatedAt: dto.updatedAt ?? null,
  };
}

/**
 * Checks a file before it costs an upload.
 *
 * The API verifies the same things from the bytes themselves, which is
 * the check that counts — this one exists so that picking a 12 MB TIFF
 * says so immediately instead of after it is on the wire. Shares its
 * reasoning, and its wording, with `rejectionReason` in ./images.js.
 *
 * @returns {string|null} why it was rejected, or null if it is fine
 */
export function rejectionReason(file) {
  if (!file) return "No file selected.";

  if (file.size > MAX_FILE_BYTES) {
    return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB.`;
  }

  // An empty type is not proof of a bad file — some browsers send
  // nothing for a drag-and-drop — so only a positively wrong type is
  // rejected here.
  if (file.type && !ACCEPTED_TYPES.includes(file.type)) {
    return `${file.name} is not a JPEG, PNG or WebP.`;
  }

  return null;
}

/** Every banner, live or hidden, in the order the carousel rotates. */
export async function listBanners({ token, signal } = {}) {
  const data = await api.get("/banners/getBanners", { token, signal });

  return (data ?? []).map(toBanner);
}

/**
 * Uploads artwork and appends it to the end of the carousel.
 *
 * One multipart request rather than one per file: a batch is a single
 * round trip, and the API rolls its own Cloudinary uploads back if the
 * rows cannot be written, so a half-added carousel is not a state this
 * can produce.
 *
 * @param {File[]} files
 * @returns {Promise<{banners: Array, added: number}>} the whole carousel,
 *          plus how many of these files it grew by
 */
export async function createBanners(files, { token } = {}) {
  const body = new FormData();

  files.forEach((file) => body.append("images", file));

  const { data, meta } = await api.post("/banners/createBanners", body, {
    token,
    envelope: true,
  });

  return {
    banners: (data ?? []).map(toBanner),
    added: meta?.counts?.added ?? files.length,
  };
}

/**
 * Swaps one slide's artwork, leaving it where it is in the order.
 *
 * The difference between this and deleting and re-uploading, and the
 * only reason it exists: a re-upload would land at the end.
 */
export async function replaceBannerImage(id, file, { token } = {}) {
  const body = new FormData();

  body.append("image", file);

  const data = await api.put(
    `/banners/replaceBannerImage/${encodeURIComponent(id)}`,
    body,
    { token },
  );

  return toBanner(data);
}

/** Takes a slide out of the rotation, or puts it back. */
export async function setBannerActive(id, active, { token } = {}) {
  const data = await api.patch(
    `/banners/setBannerActive/${encodeURIComponent(id)}`,
    { active: Boolean(active) },
    { token },
  );

  return toBanner(data);
}

/**
 * The order the slides rotate in.
 *
 * Takes every banner's id. The API refuses a partial list rather than
 * half-applying it, so the caller must send the whole set — which also
 * means a screen that has gone stale is told so instead of silently
 * renumbering banners somebody else uploaded.
 */
export async function reorderBanners(ids, { token } = {}) {
  const data = await api.patch("/banners/reorderBanners", { ids }, { token });

  return (data ?? []).map(toBanner);
}

/**
 * Deletes a banner outright, and the artwork behind it.
 *
 * There is no undo, and the Cloudinary file goes with the row —
 * re-adding the banner means uploading the image again. Hiding is what
 * `setBannerActive` is for, and it is the gesture the screen offers
 * first. Returns what is left.
 */
export async function deleteBanner(id, { token } = {}) {
  const data = await api.del(
    `/banners/deleteBanner/${encodeURIComponent(id)}`,
    { token },
  );

  return (data ?? []).map(toBanner);
}
