// src/config/review.policy.js
//
// The one definition of what a review may be (F-11.06).
//
// Mirrors stock.policy.js and order.policy.js. The bounds below are
// duplicated as CHECK constraints and column lengths in
// 012_create_reviews.sql — deliberately, and in the same spirit: this
// module is what the validator and the service refuse on, the
// constraint is what stops a value nobody defined reaching the table at
// all, including through psql.

export const MIN_RATING = 1;

export const MAX_RATING = 5;

export const RATINGS = [1, 2, 3, 4, 5];

/** Matches author_name VARCHAR(120). */
export const MAX_AUTHOR_LENGTH = 120;

/** Matches title VARCHAR(150). */
export const MAX_TITLE_LENGTH = 150;

/**
 * The body is TEXT in the database, so this is a product decision
 * rather than a storage one: a review is a paragraph the shop quotes,
 * and anything longer is a page nobody reads on a product card.
 */
export const MAX_BODY_LENGTH = 2000;

// ============================================================
// LIST QUERY
// ============================================================

export const DEFAULT_PAGE_SIZE = 25;

export const MAX_PAGE_SIZE = 100;

export const MAX_SEARCH_LENGTH = 255;

export const REVIEW_SORT = {
  /** Newest first — how the admin screen opens. */
  RECENT: "recent",
  OLDEST: "oldest",
  RATING_HIGH: "rating_high",
  RATING_LOW: "rating_low",
  PRODUCT: "product",
};

export const REVIEW_SORTS = Object.values(REVIEW_SORT);

export const DEFAULT_SORT = REVIEW_SORT.RECENT;

/**
 * ORDER BY for one sort key.
 *
 * Every branch ends in `id`, for the reason order.policy.js gives:
 * without a tie-breaker two rows written in the same transaction have
 * no defined order, and Postgres may hand one back on page 1 and page 2
 * while the other never appears at all.
 *
 * Returns the default for an unknown key rather than throwing — the
 * validator has already rejected those.
 */
export const reviewSortSql = (sort, alias = "r") => {
  switch (sort) {
    case REVIEW_SORT.OLDEST:
      return `${alias}.created_at ASC, ${alias}.id ASC`;

    case REVIEW_SORT.RATING_HIGH:
      return `${alias}.rating DESC, ${alias}.created_at DESC, ${alias}.id DESC`;

    case REVIEW_SORT.RATING_LOW:
      return `${alias}.rating ASC, ${alias}.created_at DESC, ${alias}.id DESC`;

    case REVIEW_SORT.PRODUCT:
      return `p.name ASC, ${alias}.created_at DESC, ${alias}.id DESC`;

    case REVIEW_SORT.RECENT:
    default:
      return `${alias}.created_at DESC, ${alias}.id DESC`;
  }
};
