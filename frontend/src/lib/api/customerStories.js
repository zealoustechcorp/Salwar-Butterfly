/**
 * What customers have sent the shop (F-06.08), admin side.
 *
 * These are the cards in the customer rail on the home page — a
 * photograph somebody sent, or something they wrote, or both, published
 * by the shop.
 *
 * Not the same thing as `reviews.js` next door, though they rhyme. A
 * review is about one piece and carries a rating, and both of those are
 * required. A story frequently names no product and has no stars — a
 * photograph from a wedding, a note about how fast a parcel arrived —
 * which is why it is its own table and its own client. A quote the shop
 * wants in both places is entered twice.
 *
 * Three things about the API worth knowing before calling it:
 *
 *   - **Two ways to create.** `createStoriesFromImages` takes a batch of
 *     photographs and makes one card each, with nothing typed. That is
 *     the ordinary gesture. `createStoryFromText` is for the other case:
 *     a quote with no picture.
 *   - **New stories go to the front.** The API inserts at position 1 and
 *     pushes everything else back — the opposite of a banner, because
 *     these accumulate and the fresh ones are the ones worth showing.
 *     Position is never sent.
 *   - **`updateStory` is a replace of the three typed fields.** Sending
 *     an empty `body` clears the quote. It is refused when the story has
 *     no photograph to fall back on, because that would leave a card
 *     with nothing on it.
 *
 * Errors are the `ApiError` thrown by the shared client.
 */

import { api } from "./client";

/** Mirrors MAX_STORIES in backend/src/config/customer_story.policy.js. */
export const MAX_STORIES = 60;

/** Mirrors MAX_STORIES_PER_UPLOAD. What one multipart request may carry. */
export const MAX_PER_UPLOAD = 8;

/** Mirrors MAX_BODY_LENGTH. What the editor refuses past, so the API need not. */
export const MAX_BODY_LENGTH = 600;

/** Mirrors MAX_NAME_LENGTH, and customer_name VARCHAR(120). */
export const MAX_NAME_LENGTH = 120;

/** Matches the multer limit — 5 MB per file. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const ACCEPT_ATTRIBUTE = ".jpg,.jpeg,.png,.webp";

export function toStory(dto) {
  if (!dto) return null;

  return {
    id: String(dto.id),
    customerName: dto.customerName ?? "",
    body: dto.body ?? "",
    image: dto.image ?? null,
    productId: dto.productId ?? "",
    productName: dto.productName ?? "",
    // null means "names no product"; false means "names one that is off
    // sale". The screen shows a warning only for the second.
    productActive: dto.productActive ?? null,
    position: Number(dto.position ?? 0),
    published: Boolean(dto.published),
    createdAt: dto.createdAt ?? null,
    updatedAt: dto.updatedAt ?? null,
  };
}

/**
 * Checks a file before it costs an upload. Shares its reasoning, and its
 * wording, with `rejectionReason` in ./images.js.
 *
 * @returns {string|null} why it was rejected, or null if it is fine
 */
export function rejectionReason(file) {
  if (!file) return "No file selected.";

  if (file.size > MAX_FILE_BYTES) {
    return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB.`;
  }

  if (file.type && !ACCEPTED_TYPES.includes(file.type)) {
    return `${file.name} is not a JPEG, PNG or WebP.`;
  }

  return null;
}

/** The three typed fields, as every write that carries JSON sends them. */
function toBody(fields) {
  return {
    // Sent even when empty: "" is how the API is told to clear a name or
    // a quote the admin has just deleted out of the box.
    customerName: String(fields.customerName ?? "").trim(),
    body: String(fields.body ?? "").trim(),
    productId: String(fields.productId ?? "").trim(),
  };
}

/** Every story, published or not, in the order the shop chose. */
export async function listStories({ token, signal } = {}) {
  const data = await api.get("/customerStories/getCustomerStories", {
    token,
    signal,
  });

  return (data ?? []).map(toStory);
}

/**
 * Uploads photographs and makes one story of each, at the front.
 *
 * Nothing is typed — a name and a quote are an edit afterwards, on the
 * few that have one. One multipart request, so a batch either lands
 * whole or leaves nothing behind.
 *
 * @param {File[]} files
 * @returns {Promise<{stories: Array, added: number}>} the whole list,
 *          plus how many of these files it grew by
 */
export async function createStoriesFromImages(files, { token } = {}) {
  const body = new FormData();

  files.forEach((file) => body.append("images", file));

  const { data, meta } = await api.post(
    "/customerStories/createCustomerStories",
    body,
    { token, envelope: true },
  );

  return {
    stories: (data ?? []).map(toStory),
    added: meta?.counts?.added ?? files.length,
  };
}

/** A story that is words rather than a photograph. Returns the whole list. */
export async function createStoryFromText(fields, { token } = {}) {
  const data = await api.post(
    "/customerStories/createCustomerStory",
    toBody(fields),
    { token },
  );

  return (data ?? []).map(toStory);
}

/**
 * Replaces a story's name, quote and product link.
 *
 * A replace of those three, not a patch — clearing a field and leaving
 * it alone are different edits. The photograph is not touched.
 */
export async function updateStory(id, fields, { token } = {}) {
  const data = await api.put(
    `/customerStories/updateCustomerStory/${encodeURIComponent(id)}`,
    toBody(fields),
    { token },
  );

  return toStory(data);
}

/** Swaps a story's photograph, or gives one to a story that had none. */
export async function replaceStoryImage(id, file, { token } = {}) {
  const body = new FormData();

  body.append("image", file);

  const data = await api.put(
    `/customerStories/replaceStoryImage/${encodeURIComponent(id)}`,
    body,
    { token },
  );

  return toStory(data);
}

/** Takes a story off the home page, or puts it back. */
export async function setStoryPublished(id, published, { token } = {}) {
  const data = await api.patch(
    `/customerStories/setStoryPublished/${encodeURIComponent(id)}`,
    { published: Boolean(published) },
    { token },
  );

  return toStory(data);
}

/**
 * The order the cards are shown in.
 *
 * Takes every story's id — the API refuses a partial list rather than
 * half-applying it, so a screen that has gone stale is told so.
 */
export async function reorderStories(ids, { token } = {}) {
  const data = await api.patch(
    "/customerStories/reorderCustomerStories",
    { ids },
    { token },
  );

  return (data ?? []).map(toStory);
}

/**
 * Deletes a story outright, and the photograph behind it.
 *
 * There is no undo, and a customer's photograph is not something the
 * shop can ask for twice. Hiding is what `setStoryPublished` is for.
 * Returns what is left.
 */
export async function deleteStory(id, { token } = {}) {
  const data = await api.del(
    `/customerStories/deleteCustomerStory/${encodeURIComponent(id)}`,
    { token },
  );

  return (data ?? []).map(toStory);
}
