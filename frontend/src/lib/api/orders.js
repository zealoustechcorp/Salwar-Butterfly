/**
 * Orders (F-09) — the shop's side of the queue.
 *
 * The sibling of lib/store/orders.js, and deliberately a separate file
 * rather than a shared one. The storefront's client speaks to a shopper
 * ("On its way", "we hope it fits"); this one speaks to the person
 * packing the parcel, and every call here carries an admin token that
 * the shared client attaches on its own.
 *
 * The vocabulary below mirrors backend/src/config/order.policy.js. That
 * duplication is the point of this file: the policy module decides which
 * moves are legal, and a screen that offered a move the API refuses
 * would be a button that always errors. Adding a status means changing
 * both — the API is still the authority, and a 409 from it is handled
 * rather than assumed away.
 *
 * Errors are the `ApiError` thrown by the shared client. Unlike the
 * storefront's client these throw rather than returning `{ ok: false }`:
 * the callers are admin screens with a toast and a retry, not a checkout
 * form that has to render "sold out" beside a line.
 */

import { api } from "./client";

// ============================================================
// VOCABULARY
// ============================================================

/** Where the parcel is. Mirrors ORDER_STATUS in order.policy.js. */
export const ORDER_STATUS = {
  PENDING_PAYMENT: "pending_payment",
  CONFIRMED: "confirmed",
  PACKED: "packed",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
};

/** Whether the money arrived. A separate axis from the one above. */
export const PAYMENT_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
};

/**
 * How each status reads to the shop.
 *
 * Written from behind the counter, not in front of it. The storefront
 * tells a shopper their parcel is "on its way"; the queue tells the shop
 * the piece has left the building and is no longer theirs to act on.
 *
 * `tone` is a <Badge> tone, and no two adjacent states share one — the
 * queue is scanned by colour before it is read.
 */
export const ORDER_STATUS_META = {
  [ORDER_STATUS.PENDING_PAYMENT]: {
    label: "Awaiting payment",
    tone: "amber",
    blurb: "Stock is held for this order. Confirm the transfer to accept it.",
  },
  [ORDER_STATUS.CONFIRMED]: {
    label: "Confirmed",
    tone: "brand",
    blurb: "Paid and accepted. Ready to be picked and packed.",
  },
  [ORDER_STATUS.PACKED]: {
    label: "Packed",
    tone: "gold",
    blurb: "Boxed and waiting for the courier.",
  },
  [ORDER_STATUS.SHIPPED]: {
    label: "Shipped",
    tone: "slate",
    blurb: "With the courier. It can no longer be cancelled.",
  },
  [ORDER_STATUS.DELIVERED]: {
    label: "Delivered",
    tone: "green",
    blurb: "Completed. Nothing further to do.",
  },
  [ORDER_STATUS.CANCELLED]: {
    label: "Cancelled",
    tone: "red",
    blurb: "Ended without shipping. Its pieces went back on the shelf.",
  },
};

export const PAYMENT_STATUS_META = {
  [PAYMENT_STATUS.PENDING]: { label: "Unpaid", tone: "amber" },
  [PAYMENT_STATUS.PAID]: { label: "Paid", tone: "green" },
  [PAYMENT_STATUS.FAILED]: { label: "Payment failed", tone: "red" },
  [PAYMENT_STATUS.REFUNDED]: { label: "Refunded", tone: "slate" },
};

/** Falls back to the raw word rather than blanking an unknown status. */
export const statusMeta = (status) =>
  ORDER_STATUS_META[status] ?? {
    label: String(status ?? "—").replace(/_/g, " "),
    tone: "neutral",
    blurb: "",
  };

export const paymentMeta = (status) =>
  PAYMENT_STATUS_META[status] ?? {
    label: String(status ?? "—").replace(/_/g, " "),
    tone: "neutral",
  };

/** Sorts the API accepts. The order here is the order the select shows. */
export const ORDER_SORTS = [
  { value: "recent", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "total_high", label: "Highest value" },
  { value: "total_low", label: "Lowest value" },
  { value: "updated", label: "Recently updated" },
];

/** "all" is this client's word for "send no filter", not the API's. */
export const STATUS_FILTERS = [
  { value: "all", label: "Every status" },
  ...Object.values(ORDER_STATUS).map((status) => ({
    value: status,
    label: ORDER_STATUS_META[status].label,
  })),
];

export const PAYMENT_FILTERS = [
  { value: "all", label: "Paid or not" },
  ...Object.values(PAYMENT_STATUS).map((status) => ({
    value: status,
    label: PAYMENT_STATUS_META[status].label,
  })),
];

// ============================================================
// WHAT MAY HAPPEN NEXT
// ============================================================

/**
 * The legal moves out of each status, and which endpoint performs them.
 *
 * Mirrors ORDER_TRANSITIONS, but carries something the transition table
 * does not: two of the six moves are not status writes at all.
 *
 *   confirm   also records the payment, so it goes to
 *             /confirmPayment. Setting the column alone would leave an
 *             order confirmed and unpaid, and the shop would pack it
 *             for nothing.
 *
 *   cancel    also returns the pieces to the shelf, in the same
 *             transaction, so it goes to /cancelOrder. Setting the
 *             column alone would leave the shop holding stock it
 *             cannot sell.
 *
 * The status endpoint refuses both by name, which is why `kind` exists
 * here rather than a screen guessing from the status word.
 */
const MOVES = {
  [ORDER_STATUS.PENDING_PAYMENT]: [
    { kind: "confirm", status: ORDER_STATUS.CONFIRMED, label: "Confirm payment" },
    { kind: "cancel", status: ORDER_STATUS.CANCELLED, label: "Cancel order" },
  ],
  [ORDER_STATUS.CONFIRMED]: [
    { kind: "advance", status: ORDER_STATUS.PACKED, label: "Mark packed" },
    { kind: "cancel", status: ORDER_STATUS.CANCELLED, label: "Cancel order" },
  ],
  [ORDER_STATUS.PACKED]: [
    { kind: "advance", status: ORDER_STATUS.SHIPPED, label: "Mark shipped" },
    { kind: "cancel", status: ORDER_STATUS.CANCELLED, label: "Cancel order" },
  ],
  // No cancel: once a parcel is with the courier the shop cannot
  // un-send it. What happens then is a return, which is its own flow.
  [ORDER_STATUS.SHIPPED]: [
    { kind: "advance", status: ORDER_STATUS.DELIVERED, label: "Mark delivered" },
  ],
  [ORDER_STATUS.DELIVERED]: [],
  [ORDER_STATUS.CANCELLED]: [],
};

/** @returns {Array<{kind: string, status: string, label: string}>} */
export const movesFor = (status) => MOVES[status] ?? [];

// ============================================================
// SHAPES
// ============================================================

export const EMPTY_PAGINATION = {
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

/**
 * The summary tiles before anything has loaded.
 *
 * Every status is present whether or not any order is in it, matching
 * the API — a tile that vanishes at zero is a tile the shop has to
 * notice the absence of.
 */
export const EMPTY_SUMMARY = {
  totalOrders: 0,
  paidRevenue: 0,
  awaitingPayment: 0,
  toPack: 0,
  toShip: 0,
  inTransit: 0,
  byStatus: Object.fromEntries(
    Object.values(ORDER_STATUS).map((status) => [status, { orders: 0, revenue: 0 }]),
  ),
};

/**
 * One line of an order.
 *
 * The snapshot fields are what was bought; the ids are only links to
 * what the catalogue currently calls it, and are null once the product
 * or variant is deleted. `product` is shaped for <ProductCover>, which
 * degrades to a swatch when there is no photograph — the same component
 * every other admin screen uses for a thumbnail.
 */
export function toOrderItem(dto) {
  if (!dto) return null;

  return {
    id: String(dto.id),

    productName: dto.productName ?? "",
    size: dto.size ?? null,
    unitPrice: dto.unitPrice == null ? null : Number(dto.unitPrice),
    quantity: Number(dto.quantity ?? 0),
    lineTotal: dto.lineTotal == null ? null : Number(dto.lineTotal),

    productId: dto.productId ?? null,
    variantId: dto.variantId ?? null,
    productSlug: dto.productSlug ?? null,

    product: {
      id: dto.productId ?? null,
      name: dto.productName ?? "",
      primaryImage: dto.imageUrl
        ? { url: dto.imageUrl, altText: dto.productName ?? "" }
        : null,
    },
  };
}

export function toOrder(dto) {
  if (!dto) return null;

  const items = (dto.items ?? []).map(toOrderItem);

  return {
    id: String(dto.id),
    orderNumber: dto.orderNumber ?? "",

    status: dto.status ?? ORDER_STATUS.PENDING_PAYMENT,
    paymentStatus: dto.paymentStatus ?? PAYMENT_STATUS.PENDING,

    // Null for a guest checkout. Its presence is what decides whether
    // the customer's name links anywhere.
    customerId: dto.customerId ?? null,

    contact: {
      name: dto.contact?.name ?? "",
      email: dto.contact?.email ?? "",
      phone: dto.contact?.phone ?? "",
    },

    shippingAddress: {
      line1: dto.shippingAddress?.line1 ?? "",
      line2: dto.shippingAddress?.line2 ?? null,
      landmark: dto.shippingAddress?.landmark ?? null,
      city: dto.shippingAddress?.city ?? "",
      state: dto.shippingAddress?.state ?? "",
      postalCode: dto.shippingAddress?.postalCode ?? "",
      country: dto.shippingAddress?.country ?? "",
    },

    items,

    // Sent by the API rather than counted here, so the queue and the
    // order screen cannot disagree about "3 pieces across 2 styles".
    itemCount: Number(dto.itemCount ?? items.length),
    unitCount: Number(
      dto.unitCount ?? items.reduce((sum, item) => sum + item.quantity, 0),
    ),

    subtotal: dto.subtotal == null ? null : Number(dto.subtotal),
    shippingFee: dto.shippingFee == null ? null : Number(dto.shippingFee),
    total: dto.total == null ? null : Number(dto.total),
    currency: dto.currency ?? "INR",

    customerNote: dto.customerNote ?? null,

    timeline: {
      placedAt: dto.timeline?.placedAt ?? null,
      paidAt: dto.timeline?.paidAt ?? null,
      packedAt: dto.timeline?.packedAt ?? null,
      shippedAt: dto.timeline?.shippedAt ?? null,
      deliveredAt: dto.timeline?.deliveredAt ?? null,
      cancelledAt: dto.timeline?.cancelledAt ?? null,
    },

    cancellationReason: dto.cancellationReason ?? null,

    createdAt: dto.createdAt ?? null,
    updatedAt: dto.updatedAt ?? null,
  };
}

/** The address as postal lines, empty parts dropped. */
export function addressLines(address) {
  if (!address) return [];

  return [
    address.line1,
    address.line2,
    address.landmark,
    [address.city, address.state].filter(Boolean).join(", "),
    [address.postalCode, address.country].filter(Boolean).join(" · "),
  ].filter((line) => line && String(line).trim());
}

// ============================================================
// READING
// ============================================================

function buildQuery({ status, paymentStatus, search, sort, page, limit }) {
  const params = new URLSearchParams();

  // "all" is a UI word. The API filters on the presence of the key, so
  // it must not be sent — it is not one of the statuses it accepts.
  if (status && status !== "all") params.set("status", status);
  if (paymentStatus && paymentStatus !== "all") {
    params.set("paymentStatus", paymentStatus);
  }
  if (search) params.set("search", search);
  if (sort) params.set("sort", sort);
  if (page) params.set("page", String(page));
  if (limit) params.set("limit", String(limit));

  const qs = params.toString();

  return qs ? `?${qs}` : "";
}

/**
 * A page of orders (F-09.04), newest first by default.
 *
 * Paged from the server, like customers and unlike products. An order
 * list only grows, and every row carries a name, a phone number and an
 * address — pulling all of it into a browser to show twenty-five rows is
 * the wrong default in both respects.
 *
 * @returns {Promise<{rows: Array, pagination: object}>}
 */
export async function listOrders(query = {}, { token, signal } = {}) {
  const { data, meta } = await api.get(
    `/orders/getAllOrders${buildQuery(query)}`,
    { token, signal, envelope: true },
  );

  return {
    rows: (data ?? []).map(toOrder),
    pagination: meta?.pagination ?? EMPTY_PAGINATION,
  };
}

/**
 * The counts and revenue above the queue.
 *
 * Its own request rather than something derived from the page below it:
 * the tiles describe every order there is, not the twenty-five being
 * shown, and they must not change when a filter does.
 */
export async function getOrderSummary({ token, signal } = {}) {
  const data = await api.get("/orders/getOrderSummary", { token, signal });

  return data ?? EMPTY_SUMMARY;
}

export async function getOrder(id, { token, signal } = {}) {
  const data = await api.get(`/orders/getOrderById/${encodeURIComponent(id)}`, {
    token,
    signal,
  });

  return toOrder(data);
}

// ============================================================
// MOVING AN ORDER ALONG (F-09.05)
// ============================================================

/**
 * Records that the money arrived, and accepts the order with it.
 *
 * Only legal while the order is awaiting payment; anything else comes
 * back as a 409 saying what it already is.
 *
 * `reference` is whatever identifies the transfer — a UPI transaction
 * id, a bank reference. Optional, because the shop may be looking at a
 * screenshot, but it is the only thread back from an order to the money
 * that paid for it, so it is worth typing. It is kept as an internal
 * note and never appears on the storefront.
 */
export async function confirmPayment(id, { reference } = {}, { token } = {}) {
  const data = await api.post(
    `/orders/confirmPayment/${encodeURIComponent(id)}`,
    { reference: reference?.trim() || undefined },
    { token },
  );

  return toOrder(data);
}

/**
 * One step along: packed, shipped, delivered.
 *
 * Not confirmed and not cancelled — both do more than move this column
 * and have their own calls above and below. The API refuses them here
 * by name rather than half-doing the job.
 */
export async function advanceOrder(id, status, { note } = {}, { token } = {}) {
  const data = await api.patch(
    `/orders/updateOrderStatus/${encodeURIComponent(id)}`,
    { status, note: note?.trim() || undefined },
    { token },
  );

  return toOrder(data);
}

/**
 * Cancels an order and puts its pieces back on the shelf.
 *
 * Legal from every state before dispatch and none after it. The reason
 * is required of an admin — the customer will ask about this a week
 * later, and "cancelled, no reason recorded" is not an answer the shop
 * can give them.
 */
export async function cancelOrder(id, { reason } = {}, { token } = {}) {
  const data = await api.post(
    `/orders/cancelOrder/${encodeURIComponent(id)}`,
    { reason: reason?.trim() || undefined },
    { token },
  );

  return toOrder(data);
}
