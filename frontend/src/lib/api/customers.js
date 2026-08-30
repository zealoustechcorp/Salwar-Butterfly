/**
 * Customers (F-05) — the admin's view of who has an account.
 *
 * Read-mostly, and that is the point. The shop's staff need to look
 * someone up, check the details an order will be shipped against, fix
 * a typo in a phone number, and close an account when asked. They do
 * not need to create customers — people do that themselves through
 * registration — so there is no create here.
 *
 * Every call is behind an admin token, which the shared client
 * attaches on its own. `registerCustomer` is the exception and says so.
 *
 * Errors are the `ApiError` thrown by the shared client.
 */

import { api } from "./client";

/** Sorts the API accepts. The order here is the order the select shows. */
export const CUSTOMER_SORTS = [
  { value: "recent", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
  { value: "updated", label: "Recently updated" },
];

export const EMPTY_PAGINATION = {
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

/**
 * One customer row.
 *
 * `password` is never in the payload — the API's mapper does not
 * select it — so there is nothing to strip here.
 */
export function toCustomer(dto) {
  if (!dto) return null;

  return {
    id: String(dto.id),
    name: dto.name ?? "",
    email: dto.email ?? "",
    phone: dto.phone ?? "",
    createdAt: dto.createdAt ?? null,
    updatedAt: dto.updatedAt ?? null,
  };
}

function buildQuery({ search, sort, page, limit }) {
  const params = new URLSearchParams();

  if (search) params.set("search", search);
  if (sort) params.set("sort", sort);
  if (page) params.set("page", String(page));
  if (limit) params.set("limit", String(limit));

  const qs = params.toString();

  return qs ? `?${qs}` : "";
}

/**
 * A page of customers, with the total the filter matched beside it.
 *
 * @returns {Promise<{rows: Array, pagination: object}>}
 */
export async function listCustomers(query = {}, { signal } = {}) {
  const { data, meta } = await api.get(
    `/customers/getAllCustomers${buildQuery(query)}`,
    { signal, envelope: true },
  );

  return {
    rows: (data ?? []).map(toCustomer),
    pagination: meta?.pagination ?? EMPTY_PAGINATION,
  };
}

export async function getCustomer(id, { signal } = {}) {
  const data = await api.get(
    `/customers/getCustomerById/${encodeURIComponent(id)}`,
    { signal },
  );

  return toCustomer(data);
}

/**
 * Corrects a customer's details (F-05.06).
 *
 * Send only what changed. Email and phone are unique across live
 * accounts, so a clash comes back as a 409 with the offending field
 * named in `fields` — which is what puts the message under the right
 * input rather than in a toast.
 */
export async function updateCustomer(id, fields, { token } = {}) {
  const data = await api.put(
    `/customers/updateCustomer/${encodeURIComponent(id)}`,
    fields,
    { token },
  );

  return toCustomer(data);
}

/**
 * Closes an account.
 *
 * A soft delete on the API side: the row stays and is stamped
 * `deleted_at`, so an order that points at this customer still has a
 * customer to point at. It leaves the listing, and its email and phone
 * are freed for a new sign-up — the uniqueness indexes only cover rows
 * that have not been deleted.
 */
export async function deleteCustomer(id, { token } = {}) {
  await api.del(`/customers/deleteCustomer/${encodeURIComponent(id)}`, {
    token,
  });

  return { id: String(id) };
}

/**
 * Registration (F-05.01) — the one public call in this file.
 *
 * `token: null` on purpose: a person signing up is not an admin, and
 * sending the panel's token with their registration would be wrong
 * even though the API ignores it.
 */
export async function registerCustomer(fields) {
  const data = await api.post("/customers/register", fields, { token: null });

  return toCustomer(data);
}
