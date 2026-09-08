/**
 * The shopper's saved delivery addresses (F-05.03, F-08.05).
 *
 * The sibling of lib/store/wishlist.js and lib/store/orders.js, following the
 * same rules: every call names its token explicitly, and expected failures come
 * back as `{ ok: false }` rather than throwing — the callers are a checkout form
 * and an account panel, both of which have somewhere to render a message.
 *
 * The address shape the API returns is the same shape checkout sends as
 * `shippingAddress`. That is deliberate on both sides (see
 * backend/src/mapper/customer_address.mapper.js), and `toShippingAddress` below
 * is the one place that relies on it — so if the two ever drift, one function
 * has to change rather than every call site.
 *
 * These are only ever called for a signed-in shopper. A guest types their
 * address at checkout and it lives on the order alone.
 */

import { api, ApiError } from "@/lib/api/client";

/** The most a shopper may save. Mirrors MAX_ADDRESSES in the service. */
export const MAX_ADDRESSES = 3;

function toFailure(error) {
  if (!(error instanceof ApiError)) throw error;

  return { ok: false, code: error.code, status: error.status, error: error.message };
}

/**
 * A saved address as checkout wants to send it.
 *
 * Drops the bookkeeping — id, label, the default flag, the timestamps — and
 * keeps the seven fields the order payload accepts. Sending the rest would not
 * break anything today, but an API that quietly ignores unknown keys is one
 * that stops ignoring them eventually.
 */
export function toShippingAddress(address) {
  if (!address) return null;

  return {
    line1: address.line1 ?? "",
    line2: address.line2 ?? "",
    landmark: address.landmark ?? "",
    city: address.city ?? "",
    state: address.state ?? "",
    postalCode: address.postalCode ?? "",
    country: address.country ?? "India",
  };
}

/**
 * Two addresses that would put a parcel in the same place.
 *
 * Used by checkout to decide whether a typed address is worth offering to
 * save. Compares only the fields that reach the courier — a shopper who
 * retypes their own address without the landmark has not moved house.
 */
export function isSameAddress(a, b) {
  if (!a || !b) return false;

  const norm = (value) => String(value ?? "").trim().toLowerCase();

  return (
    norm(a.line1) === norm(b.line1) &&
    norm(a.city) === norm(b.city) &&
    norm(a.state) === norm(b.state) &&
    norm(a.postalCode) === norm(b.postalCode)
  );
}

/** The account's saved addresses, default first. */
export async function fetchAddresses(token, { signal } = {}) {
  try {
    const addresses = await api.get("/addresses/getMyAddresses", { token, signal });

    return { ok: true, addresses: addresses ?? [] };
  } catch (error) {
    if (error?.name === "AbortError") throw error;

    return toFailure(error);
  }
}

/**
 * Saves a new address.
 *
 * Returns the one address rather than the list, which is what the API gives
 * back — the caller needs its id to select it at checkout.
 */
export async function createAddress(address, token) {
  try {
    const saved = await api.post("/addresses/addAddress", address, { token });

    return { ok: true, address: saved };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateAddress(id, address, token) {
  try {
    const saved = await api.put(
      `/addresses/updateAddress/${encodeURIComponent(id)}`,
      address,
      { token },
    );

    return { ok: true, address: saved };
  } catch (error) {
    return toFailure(error);
  }
}

export async function setDefaultAddress(id, token) {
  try {
    const saved = await api.patch(
      `/addresses/setDefaultAddress/${encodeURIComponent(id)}`,
      undefined,
      { token },
    );

    return { ok: true, address: saved };
  } catch (error) {
    return toFailure(error);
  }
}

/** Removes one. Returns the addresses that remain — deleting can move the default. */
export async function deleteAddress(id, token) {
  try {
    const addresses = await api.del(
      `/addresses/deleteAddress/${encodeURIComponent(id)}`,
      { token },
    );

    return { ok: true, addresses: addresses ?? [] };
  } catch (error) {
    return toFailure(error);
  }
}
