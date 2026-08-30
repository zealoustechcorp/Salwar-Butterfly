// src/config/order.policy.js
//
// The one definition of what an order may be and where it may go next
// (F-07).
//
// Mirrors stock.policy.js and customer.query.js, for the same reason:
// the validator, the service and the repository all need to agree about
// these words, and a rule split across three files is how a screen ends
// up offering a status the API refuses.
//
// The status list here is duplicated as a CHECK constraint in
// 008_create_orders.sql. That is deliberate — this module decides which
// moves are legal, the constraint only stops a value nobody defined from
// reaching the table at all, including through psql. Adding a status
// means changing both.

// ============================================================
// ORDER STATUS — where the parcel is
// ============================================================

export const ORDER_STATUS = {
  /**
   * Placed, stock reserved, money not yet taken.
   *
   * Stock is decremented the moment an order reaches this state rather
   * than when payment confirms. This catalogue holds one or two pieces
   * per size: if two shoppers can both reach a payment page for the
   * last piece, one of them pays for something the shop cannot send,
   * and a refund is a worse outcome than a "sold out" message.
   */
  PENDING_PAYMENT: "pending_payment",

  /** Paid and accepted by the shop. The parcel can be picked. */
  CONFIRMED: "confirmed",

  PACKED: "packed",

  SHIPPED: "shipped",

  DELIVERED: "delivered",

  /** Ended without shipping. Reserved stock goes back to the shelf. */
  CANCELLED: "cancelled",
};

export const ORDER_STATUSES = Object.values(ORDER_STATUS);

// ============================================================
// PAYMENT STATUS — whether the money arrived
// ============================================================
//
// A separate axis from the one above, because the two genuinely move
// independently. "Paid but not yet packed" and "cancelled after
// payment, refund owed" are both real states, and neither is
// expressible if the parcel and the money share one column.

export const PAYMENT_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
};

export const PAYMENT_STATUSES = Object.values(PAYMENT_STATUS);

// ============================================================
// LEGAL TRANSITIONS
// ============================================================
//
// Explicit rather than "any status to any status". An order that jumps
// from pending_payment straight to delivered has skipped taking the
// money, and the admin panel is a screen with buttons on it — the wrong
// one will be clicked eventually.
//
// Cancellation is reachable from every state before dispatch and from
// none after it. Once a parcel is with the courier the shop cannot
// un-send it; what happens then is a return, which is its own flow and
// not this column.

export const ORDER_TRANSITIONS = Object.freeze({
  [ORDER_STATUS.PENDING_PAYMENT]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.CONFIRMED]: [ORDER_STATUS.PACKED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PACKED]: [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.SHIPPED]: [ORDER_STATUS.DELIVERED],
  [ORDER_STATUS.DELIVERED]: [],
  [ORDER_STATUS.CANCELLED]: [],
});

/** Nothing moves out of these. */
export const TERMINAL_STATUSES = [ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED];

export const canTransition = (from, to) =>
  (ORDER_TRANSITIONS[from] ?? []).includes(to);

/**
 * The timestamp column a status change stamps, or null where the status
 * has none.
 *
 * Here rather than in the repository so the SQL that applies a
 * transition does not carry a switch of its own — one place decides
 * what "shipped" means, and the write just uses it.
 */
export const STATUS_TIMESTAMP_COLUMN = Object.freeze({
  [ORDER_STATUS.CONFIRMED]: null, // paid_at is stamped by payment, not by this
  [ORDER_STATUS.PACKED]: "packed_at",
  [ORDER_STATUS.SHIPPED]: "shipped_at",
  [ORDER_STATUS.DELIVERED]: "delivered_at",
  [ORDER_STATUS.CANCELLED]: "cancelled_at",
});

/**
 * Statuses that hold stock off the shelf.
 *
 * Everything except cancelled: an order that is still going to ship,
 * whether or not it has been paid for, owns the pieces on it. Moving
 * into a status outside this set is what returns them.
 */
export const STOCK_HOLDING_STATUSES = ORDER_STATUSES.filter(
  (status) => status !== ORDER_STATUS.CANCELLED,
);

// ============================================================
// LIMITS
// ============================================================

/**
 * The most lines one order may carry.
 *
 * A bag is a handful of pieces. A request with hundreds is a script,
 * not a shopper, and every line holds a row lock for the length of the
 * checkout transaction.
 */
export const MAX_ORDER_LINES = 50;

/**
 * The most of one size a single order may take.
 *
 * A boutique holding one or two pieces per size has no legitimate order
 * for forty of anything, and the stock check would refuse it a moment
 * later regardless — this refuses it before a transaction is opened.
 */
export const MAX_LINE_QUANTITY = 20;

/**
 * Shipping, in rupees.
 *
 * Zero, which is what the storefront promises: "Free all over India".
 * Written onto every order rather than assumed at read time, so raising
 * it later does not restate what past orders were charged.
 */
export const SHIPPING_FEE = 0;

export const CURRENCY = "INR";

// ============================================================
// LIST QUERY
// ============================================================

export const DEFAULT_PAGE_SIZE = 25;

/** An order list carries names, addresses and phone numbers. */
export const MAX_PAGE_SIZE = 100;

/** Longer than any order number, name, email or city stored. */
export const MAX_SEARCH_LENGTH = 255;

export const ORDER_SORT = {
  /** Newest first — how both the admin queue and "my orders" open. */
  RECENT: "recent",
  OLDEST: "oldest",
  TOTAL_HIGH: "total_high",
  TOTAL_LOW: "total_low",
  UPDATED: "updated",
};

export const ORDER_SORTS = Object.values(ORDER_SORT);

export const DEFAULT_SORT = ORDER_SORT.RECENT;

/**
 * ORDER BY for one sort key.
 *
 * Every branch ends in `id`. Without that tie-breaker two orders placed
 * in the same transaction have no defined order, and Postgres may return
 * one of them on page 1 and page 2 while the other never appears.
 *
 * Returns the default for an unknown key rather than throwing — the
 * validator has already rejected those.
 */
export const orderSortSql = (sort, alias = "o") => {
  switch (sort) {
    case ORDER_SORT.OLDEST:
      return `${alias}.placed_at ASC, ${alias}.id ASC`;

    case ORDER_SORT.TOTAL_HIGH:
      return `${alias}.total DESC, ${alias}.id DESC`;

    case ORDER_SORT.TOTAL_LOW:
      return `${alias}.total ASC, ${alias}.id ASC`;

    case ORDER_SORT.UPDATED:
      return `${alias}.updated_at DESC, ${alias}.id DESC`;

    case ORDER_SORT.RECENT:
    default:
      return `${alias}.placed_at DESC, ${alias}.id DESC`;
  }
};
