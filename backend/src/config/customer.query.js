// src/config/customer.query.js
//
// How the admin customer list may be asked for (F-05.04).
//
// The page caps, the search term and the sort whitelist live here
// rather than in the repository because three layers need to agree
// about them: the validator rejects a malformed request, the service
// clamps what it was given, and the repository turns the sort key into
// ORDER BY. Splitting that across three files is how a screen ends up
// offering a sort the API silently ignores.
//
// Mirrors the shape of stock.policy.js, for the same reason.

/** Rows per page when the caller does not say. */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * The most rows one request may ask for.
 *
 * A customer list is personal data; an unbounded `limit` turns one
 * request into a full export of the shop's customers.
 */
export const MAX_PAGE_SIZE = 100;

/** Longer than any name, email or phone the schema stores. */
export const MAX_SEARCH_LENGTH = 255;

export const CUSTOMER_SORT = {
  /** Newest sign-ups first — what the admin usually wants to see. */
  RECENT: "recent",
  OLDEST: "oldest",
  NAME: "name",
  UPDATED: "updated",
};

export const CUSTOMER_SORTS = Object.values(CUSTOMER_SORT);

export const DEFAULT_SORT = CUSTOMER_SORT.RECENT;

/**
 * ORDER BY for one sort key.
 *
 * Every branch ends in `id`. Without that tie-breaker two customers
 * created in the same transaction have no defined order, and Postgres
 * is free to return one of them on page 1 and page 2 while the other
 * never appears at all.
 *
 * Returns the default ordering for an unknown key rather than throwing
 * — the validator has already rejected those, and a list query is not
 * the place to fail on a value that only affects presentation.
 */
export const customerSortSql = (sort, alias = "c") => {
  switch (sort) {
    case CUSTOMER_SORT.OLDEST:
      return `${alias}.created_at ASC, ${alias}.id ASC`;

    case CUSTOMER_SORT.NAME:
      return `LOWER(${alias}.name) ASC, ${alias}.id ASC`;

    case CUSTOMER_SORT.UPDATED:
      return `${alias}.updated_at DESC, ${alias}.id DESC`;

    case CUSTOMER_SORT.RECENT:
    default:
      return `${alias}.created_at DESC, ${alias}.id DESC`;
  }
};

/**
 * Makes a search term safe to drop inside an ILIKE pattern.
 *
 * `%` and `_` are wildcards there, so an admin searching for "a_b"
 * would otherwise match "axb". The backslash is escaped first, or it
 * would escape the escapes this function just added. Callers must pair
 * this with `ESCAPE '\'` in the SQL.
 */
export const escapeLikePattern = (term) =>
  String(term ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");

/** Clamps a requested page/limit into the range the API will serve. */
export const clampPagination = ({ page, limit } = {}) => ({
  page: Math.max(Number.parseInt(page, 10) || 1, 1),
  limit: Math.min(
    Math.max(Number.parseInt(limit, 10) || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  ),
});
