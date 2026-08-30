/**
 * Storefront wishlist calls against the Express API (F-07).
 *
 * The sibling of lib/store/orders.js and lib/store/payments.js, following the
 * same rules: every call names its token explicitly, and expected failures
 * come back as `{ ok: false }` rather than throwing.
 *
 * Every one of these returns the *whole* list rather than an acknowledgement,
 * because that is what the API returns. A client that applied a delta locally
 * would be one dropped response away from a heart icon that disagrees with the
 * wishlist page, and there is no cheap way to notice that has happened.
 *
 * These are only ever called for a signed-in shopper. A guest's wishlist lives
 * in localStorage and never comes near this file — see <StoreProvider>, which
 * owns the decision about which of the two is in play.
 */

import { api, ApiError } from "@/lib/api/client";

/** The API answers with `[{ productId, savedAt }]`; the store wants ids. */
const toIds = (items) => (items ?? []).map((item) => item.productId);

function toFailure(error) {
  if (!(error instanceof ApiError)) throw error;

  return { ok: false, code: error.code, status: error.status, error: error.message };
}

/** The account's saved pieces, newest first. */
export async function fetchWishlist(token, { signal } = {}) {
  try {
    const items = await api.get("/wishlist/getMyWishlist", { token, signal });

    return { ok: true, ids: toIds(items) };
  } catch (error) {
    if (error?.name === "AbortError") throw error;

    return toFailure(error);
  }
}

export async function saveToWishlist(productId, token) {
  try {
    const items = await api.post("/wishlist/addItem", { productId }, { token });

    return { ok: true, ids: toIds(items) };
  } catch (error) {
    return toFailure(error);
  }
}

export async function removeFromWishlist(productId, token) {
  try {
    const items = await api.del(
      `/wishlist/removeItem/${encodeURIComponent(productId)}`,
      { token },
    );

    return { ok: true, ids: toIds(items) };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Folds this device's guest list into the account's (F-07).
 *
 * Called once, the moment somebody signs in. A merge, never a replace: the
 * account may already have saves made on a phone, and this laptop's three
 * pieces are an addition to them.
 */
export async function mergeWishlist(productIds, token) {
  try {
    const items = await api.post(
      "/wishlist/mergeWishlist",
      { productIds: productIds ?? [] },
      { token },
    );

    return { ok: true, ids: toIds(items) };
  } catch (error) {
    return toFailure(error);
  }
}
