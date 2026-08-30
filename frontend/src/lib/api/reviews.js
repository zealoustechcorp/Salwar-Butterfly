/**
 * Reviews and ratings (F-11.06).
 *
 * Admin-only, and that is the design rather than a gap: the FRS puts
 * this on an admin page because the shop publishes what customers say
 * on WhatsApp and on the phone. There is no shopper-facing write here
 * because there is none on the API either.
 *
 * One editing rule is worth knowing before calling `updateReview`:
 *
 *   omitted        leave the field as it is
 *   ""             clear it
 *
 * Those are different intentions, and the API treats them as such. A
 * form that sends every field on every save will therefore never
 * accidentally wipe a body it did not touch — but one that sends `""`
 * for an untouched empty input will clear it, which is the same
 * outcome and equally correct.
 *
 * Errors are the `ApiError` thrown by the shared client.
 */

import { api } from "./client";

export const RATINGS = [5, 4, 3, 2, 1];

export const REVIEW_SORTS = [
  { value: "recent", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "rating_high", label: "Highest rated" },
  { value: "rating_low", label: "Lowest rated" },
  { value: "product", label: "Product A–Z" },
];

export const PUBLISHED_FILTERS = [
  { value: "all", label: "Published or not" },
  { value: "true", label: "Published only" },
  { value: "false", label: "Hidden only" },
];

export const RATING_FILTERS = [
  { value: "all", label: "Any rating" },
  ...RATINGS.map((rating) => ({
    value: String(rating),
    label: `${rating} star${rating === 1 ? "" : "s"}`,
  })),
];

export const EMPTY_SUMMARY = {
  total: 0,
  published: 0,
  hidden: 0,
  average: 0,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

/**
 * One review.
 *
 * The product is reshaped into the `primaryImage` that <ProductCover>
 * expects, so the review table reuses the same thumbnail component as
 * every other admin screen.
 *
 * `customer` is null on most rows and that is normal, not a failed
 * join — see the module header.
 */
export function toReview(dto) {
  if (!dto) return null;

  return {
    id: String(dto.id),
    productId: String(dto.productId),
    authorName: dto.authorName ?? "",
    rating: Number(dto.rating ?? 0),
    title: dto.title ?? "",
    body: dto.body ?? "",
    published: Boolean(dto.published),

    product: {
      id: String(dto.product?.id ?? dto.productId),
      name: dto.product?.name ?? "",
      slug: dto.product?.slug ?? "",
      active: Boolean(dto.product?.active),
      primaryImage: dto.product?.imageUrl
        ? { url: dto.product.imageUrl, altText: dto.product?.name ?? "" }
        : null,
    },

    customer: dto.customer
      ? {
          id: String(dto.customer.id),
          name: dto.customer.name ?? "",
          email: dto.customer.email ?? "",
        }
      : null,

    createdAt: dto.createdAt ?? null,
    updatedAt: dto.updatedAt ?? null,
  };
}

function buildQuery({ productId, rating, published, search, sort, page, limit }) {
  const params = new URLSearchParams();

  if (productId && productId !== "all") params.set("productId", productId);
  if (rating && rating !== "all") params.set("rating", String(rating));
  if (published && published !== "all") params.set("published", published);
  if (search) params.set("search", search);
  if (sort) params.set("sort", sort);
  if (page) params.set("page", String(page));
  if (limit) params.set("limit", String(limit));

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * A page of reviews, with the scores beside it.
 *
 * The summary follows the product filter but not the others: "this
 * product averages 4.3" is a fact about the product, where the same
 * figure recomputed under a `rating=5` filter would read 5.0 and mean
 * nothing.
 */
export async function listReviews(query = {}, { token, signal } = {}) {
  const { data, meta } = await api.get(`/reviews/getReviews${buildQuery(query)}`, {
    token,
    signal,
    envelope: true,
  });

  return {
    rows: (data ?? []).map(toReview),
    summary: meta?.summary ?? EMPTY_SUMMARY,
    pagination: meta?.pagination ?? {
      page: 1,
      limit: 25,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}

/** The scores on their own — for a screen with no list to show. */
export async function getRatingSummary({ productId, token, signal } = {}) {
  const data = await api.get(
    `/reviews/getRatingSummary${productId ? `?productId=${encodeURIComponent(productId)}` : ""}`,
    { token, signal },
  );

  return data ?? EMPTY_SUMMARY;
}

export async function getReview(id, { token, signal } = {}) {
  const data = await api.get(
    `/reviews/getReviewById/${encodeURIComponent(id)}`,
    { token, signal },
  );

  return toReview(data);
}

export async function createReview(input, { token } = {}) {
  const data = await api.post(
    "/reviews/createReview",
    {
      productId: input.productId,
      authorName: input.authorName,
      rating: Number(input.rating),

      // Sent only when there is something to send: the API reads `""`
      // as "clear this", which on a create is the same as omitting it,
      // but saying so explicitly keeps the two calls symmetrical.
      ...(input.title ? { title: input.title } : {}),
      ...(input.body ? { body: input.body } : {}),
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.published === undefined ? {} : { published: input.published }),
    },
    { token },
  );

  return toReview(data);
}

/**
 * A partial update.
 *
 * Only the keys present in `patch` are sent, so a caller can change one
 * field without restating the rest. An explicit `""` clears.
 */
export async function updateReview(id, patch, { token } = {}) {
  const body = {};

  if (patch.authorName !== undefined) body.authorName = patch.authorName;
  if (patch.rating !== undefined) body.rating = Number(patch.rating);
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.body !== undefined) body.body = patch.body;
  if (patch.published !== undefined) body.published = patch.published;
  if (patch.customerId !== undefined) body.customerId = patch.customerId;

  const data = await api.put(
    `/reviews/updateReview/${encodeURIComponent(id)}`,
    body,
    { token },
  );

  return toReview(data);
}

/** Takes a review off the storefront, or puts it back. */
export async function setReviewPublished(id, published, { token } = {}) {
  const data = await api.patch(
    `/reviews/setPublished/${encodeURIComponent(id)}`,
    { published: Boolean(published) },
    { token },
  );

  return toReview(data);
}

/**
 * Deletes a review outright.
 *
 * There is no undo. Hiding is what `setReviewPublished` is for, and it
 * is the gesture the table offers first.
 */
export async function deleteReview(id, { token } = {}) {
  await api.del(`/reviews/deleteReview/${encodeURIComponent(id)}`, { token });
  return true;
}
