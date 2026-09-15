// src/services/order.service.js

import { OrderRepository } from "../repository/order.repository.js";
import { OrderMapper } from "../mapper/order.mapper.js";
import {
  canTransition,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  MAX_PAGE_SIZE,
  ORDER_STATUS,
  ORDER_TRANSITIONS,
  SHIPPING_FEE,
  TERMINAL_STATUSES,
} from "../config/order.policy.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const assertUuid = (value, label) => {
  const normalized = String(value ?? "").trim();

  if (!normalized || !UUID_REGEX.test(normalized)) {
    throw new ApiError(400, `Invalid ${label}`);
  }

  return normalized;
};

const trimOrNull = (value) => {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
};

const normalizeSearch = (value) => {
  const search = String(value ?? "").trim();
  if (!search) return null;
  return search.slice(0, 255);
};

/**
 * Which statuses a cancellation may be applied from.
 *
 * Derived from the transition table rather than listed again here.
 * Adding a status to ORDER_TRANSITIONS with a route to cancelled makes
 * it cancellable automatically; writing the list twice is how the two
 * quietly stop agreeing.
 */
const CANCELLABLE_FROM = Object.entries(ORDER_TRANSITIONS)
  .filter(([, next]) => next.includes(ORDER_STATUS.CANCELLED))
  .map(([status]) => status);

/**
 * Turns a failed checkout into the sentence a shopper needs.
 *
 * Each of these is something the shopper can do something about — swap
 * a size, reduce a quantity, remove a line — so each says which piece
 * and what happened rather than "checkout failed".
 */
const explainCheckoutFailure = (error) => {
  if (error?.code === "VARIANT_NOT_FOUND") {
    return new ApiError(
      404,
      "One of the pieces in your bag is no longer in the shop. Remove it and try again.",
    );
  }

  if (error?.code === "VARIANT_UNAVAILABLE") {
    return new ApiError(
      409,
      `${error.productName}${error.size ? ` (size ${error.size})` : ""} is no longer on sale. Remove it from your bag to continue.`,
    );
  }

  if (error?.code === "INSUFFICIENT_STOCK") {
    return new ApiError(
      409,
      error.available === 0
        ? `${error.productName}${error.size ? ` (size ${error.size})` : ""} sold out while you were checking out. Remove it from your bag to continue.`
        : `Only ${error.available} left of ${error.productName}${error.size ? ` (size ${error.size})` : ""}. Reduce the quantity to continue.`,
    );
  }

  return null;
};

/**
 * Whether this caller may see this order.
 *
 * An admin may see any. A signed-in shopper may see their own. A guest
 * order belongs to nobody with a token and is unreachable through these
 * routes at all — it is looked up by number and email, which is a
 * different endpoint with a different check.
 *
 * 404 rather than 403, matching requireSelf: telling someone "that
 * order exists but is not yours" confirms it exists, and an order
 * number is short enough to guess at.
 */
const assertVisibleTo = (order, { customerId = null, isAdmin = false }) => {
  if (isAdmin) return;

  if (!order.customer_id || String(order.customer_id) !== String(customerId)) {
    logger.warn("Order ownership check failed", {
      orderId: order.id,
      customerId,
    });

    throw ApiError.notFound("Order not found", "ORDER_NOT_FOUND");
  }
};

const loadOrder = async (id) => {
  const order = await OrderRepository.findById(id);

  if (!order) {
    throw ApiError.notFound("Order not found", "ORDER_NOT_FOUND");
  }

  return order;
};

export const OrderService = {
  // ==========================================================
  // PLACE AN ORDER
  // ==========================================================

  /**
   * Checkout (F-07.01).
   *
   * The service's whole job here is to decide what the order is *about*
   * — who it belongs to, where it goes, what it costs to ship. What it
   * contains and what it costs are the repository's, because those have
   * to be settled inside the same transaction that reserves the stock.
   *
   * `customerId` comes from the token and is never read from the body.
   * Null is a guest checkout, which the storefront bag explicitly
   * offers, and is a supported path rather than a fallback.
   */
  async placeOrder({
    customerId = null,
    contact,
    shippingAddress,
    items,
    customerNote = null,
    whatsappOptIn = undefined,
  }) {
    try {
      const normalizedLines = items.map((item) => ({
        variantId: assertUuid(item.variantId, "variant ID"),
        quantity: Number(item.quantity),
      }));

      const orderId = await OrderRepository.create({
        customerId: customerId ? assertUuid(customerId, "customer ID") : null,

        contact: {
          name: String(contact.name).trim(),
          // Lower-cased to match how customers are stored and how the
          // guest lookup searches — a shopper who typed a capital at
          // checkout must still find their order later.
          email: String(contact.email).trim().toLowerCase(),
          phone: String(contact.phone).trim(),
        },

        shipping: {
          line1: String(shippingAddress.line1).trim(),
          line2: trimOrNull(shippingAddress.line2),
          landmark: trimOrNull(shippingAddress.landmark),
          city: String(shippingAddress.city).trim(),
          state: String(shippingAddress.state).trim(),
          postalCode: String(shippingAddress.postalCode).trim(),
          country: trimOrNull(shippingAddress.country) ?? "India",
        },

        lines: normalizedLines,

        // From the policy module, not the request. Shipping is the
        // shop's decision; a client that could send it could send zero.
        shippingFee: SHIPPING_FEE,

        customerNote: trimOrNull(customerNote),

        // undefined is left as undefined rather than defaulted here, so
        // that "the client did not say" reaches the INSERT and the
        // column's own DEFAULT decides. Defaulting in two places is how
        // the two eventually disagree.
        whatsappOptIn,
      });

      // Re-read through the full shape so the response carries the
      // order number the sequence assigned and the priced lines as
      // stored, rather than an echo of what was sent.
      const order = await OrderRepository.findById(orderId);

      logger.info("Order placed", {
        orderId,
        orderNumber: order?.order_number,
        customerId,
      });

      return OrderMapper.toCustomerDTO(order);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      const explained = explainCheckoutFailure(error);
      if (explained) throw explained;

      logger.error("OrderService.placeOrder failed", {
        customerId,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to place the order");
    }
  },

  // ==========================================================
  // READ
  // ==========================================================

  /**
   * A page of orders, for whoever is asking.
   *
   * `customerId` is applied as a filter rather than checked afterwards.
   * Filtering in SQL is what makes the paging honest — dropping other
   * people's orders from an already-fetched page would return short
   * pages and a total that counts orders the caller cannot see. It is
   * also the difference between a leak and a bug: a forgotten
   * post-filter serves somebody else's address.
   */
  async listOrders({
    customerId = null,
    isAdmin = false,
    status = null,
    paymentStatus = null,
    search = null,
    sort = DEFAULT_SORT,
    page = 1,
    limit = DEFAULT_PAGE_SIZE,
  } = {}) {
    try {
      // A non-admin listing with no customer id would be every order in
      // the shop. There is no code path that should reach this; if one
      // ever does, it must fail loudly rather than serve the lot.
      if (!isAdmin && !customerId) {
        throw ApiError.unauthorized("Authentication required", "UNAUTHORIZED");
      }

      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.min(
        Math.max(Number(limit) || DEFAULT_PAGE_SIZE, 1),
        MAX_PAGE_SIZE,
      );

      const result = await OrderRepository.findAll({
        customerId: customerId ? assertUuid(customerId, "customer ID") : null,
        status,
        paymentStatus,
        search: normalizeSearch(search),
        sort: sort || DEFAULT_SORT,
        page: safePage,
        limit: safeLimit,
      });

      const totalPages =
        result.total === 0 ? 0 : Math.ceil(result.total / safeLimit);

      return {
        data: isAdmin
          ? OrderMapper.toDTOList(result.rows)
          : OrderMapper.toCustomerDTOList(result.rows),

        pagination: {
          page: safePage,
          limit: safeLimit,
          total: result.total,
          totalPages,
          hasNextPage: safePage < totalPages,
          hasPreviousPage: safePage > 1,
        },
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("OrderService.listOrders failed", { error: error?.message });

      throw new ApiError(500, "Failed to fetch orders");
    }
  },

  async getOrderById(id, { customerId = null, isAdmin = false } = {}) {
    try {
      const order = await loadOrder(assertUuid(id, "order ID"));

      assertVisibleTo(order, { customerId, isAdmin });

      return isAdmin
        ? OrderMapper.toDTO(order)
        : OrderMapper.toCustomerDTO(order);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("OrderService.getOrderById failed", {
        orderId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch the order");
    }
  },

  /**
   * Tracking an order without an account.
   *
   * The number alone is not enough — they run in sequence, so knowing
   * one is knowing roughly where the others are. The email that placed
   * it is the second factor, and both must match.
   *
   * Both misses return the same 404 on purpose. Distinguishing "no such
   * order" from "wrong email" turns this into a way to test whether an
   * order number exists.
   */
  async trackOrder({ orderNumber, email }) {
    try {
      const number = String(orderNumber ?? "").trim();
      const contactEmail = String(email ?? "").trim().toLowerCase();

      if (!number || !contactEmail) {
        throw new ApiError(400, "An order number and an email are required");
      }

      const order = await OrderRepository.findByOrderNumber(number);

      if (!order || String(order.contact_email).toLowerCase() !== contactEmail) {
        logger.warn("Order tracking lookup failed", { orderNumber: number });

        throw ApiError.notFound(
          "No order found with that number and email",
          "ORDER_NOT_FOUND",
        );
      }

      return OrderMapper.toCustomerDTO(order);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("OrderService.trackOrder failed", { error: error?.message });

      throw new ApiError(500, "Failed to look up the order");
    }
  },

  /** The tiles above the admin queue. */
  async getSummary() {
    try {
      const rows = await OrderRepository.summary();
      return OrderMapper.toSummary(rows);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("OrderService.getSummary failed", { error: error?.message });

      throw new ApiError(500, "Failed to fetch the order summary");
    }
  },

  // ==========================================================
  // MOVE AN ORDER ALONG
  // ==========================================================

  /**
   * Confirms payment and accepts the order (F-07.03).
   *
   * Called by an admin today, after seeing the transfer. When a gateway
   * lands, its verified webhook calls the same method — the transition
   * and its guard do not change, only what triggers them.
   */
  async confirmPayment(id, { reference = null } = {}) {
    try {
      const orderId = assertUuid(id, "order ID");

      const row = await OrderRepository.confirmPayment(orderId, {
        reference: trimOrNull(reference),
      });

      // The guarded UPDATE matched nothing: say which of the two
      // reasons it was rather than a bare 409.
      if (!row) {
        const current = await loadOrder(orderId);

        throw new ApiError(
          409,
          current.status === ORDER_STATUS.CANCELLED
            ? "This order was cancelled and cannot be confirmed."
            : `This order is already ${current.status.replace(/_/g, " ")}.`,
        );
      }

      const order = await OrderRepository.findById(orderId);

      logger.info("Order confirmed", {
        orderId,
        orderNumber: order?.order_number,
      });

      return OrderMapper.toDTO(order);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("OrderService.confirmPayment failed", {
        orderId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to confirm the payment");
    }
  },

  /**
   * One step along: packed, shipped, delivered (F-07.04).
   *
   * The legality of the move is decided here, against the order as it
   * is *now*, and then the write is made conditional on it still being
   * there. Both are needed: the first gives a useful message, the
   * second is what makes it safe when two admins have the same order
   * open.
   */
  async changeStatus(id, nextStatus, { note = null } = {}) {
    try {
      const orderId = assertUuid(id, "order ID");
      const order = await loadOrder(orderId);

      const current = order.status;

      if (current === nextStatus) {
        throw new ApiError(
          409,
          `This order is already ${nextStatus.replace(/_/g, " ")}.`,
        );
      }

      if (TERMINAL_STATUSES.includes(current)) {
        throw new ApiError(
          409,
          `This order is ${current.replace(/_/g, " ")} and cannot be changed.`,
        );
      }

      if (!canTransition(current, nextStatus)) {
        const allowed = ORDER_TRANSITIONS[current] ?? [];

        throw new ApiError(
          409,
          allowed.length === 0
            ? `An order that is ${current.replace(/_/g, " ")} cannot be moved.`
            : `An order that is ${current.replace(/_/g, " ")} can only become: ${allowed.join(", ")}.`,
        );
      }

      const row = await OrderRepository.updateStatus(orderId, current, nextStatus, {
        note: trimOrNull(note),
      });

      // Only reachable if the order moved between the read above and
      // the write — which is the case the guard exists for.
      if (!row) {
        throw new ApiError(
          409,
          "This order changed while the screen was open. Reload and try again.",
        );
      }

      const updated = await OrderRepository.findById(orderId);

      return OrderMapper.toDTO(updated);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("OrderService.changeStatus failed", {
        orderId: id,
        nextStatus,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update the order");
    }
  },

  /**
   * Cancels an order and returns its pieces to the shelf (F-07.05).
   *
   * Its own method rather than a case of changeStatus, because it is
   * not only a status change — the stock has to come back, in the same
   * transaction, or the shop is left holding pieces it cannot sell.
   *
   * A shopper may cancel their own order only while it is still
   * awaiting payment. Once the shop has taken the money and started
   * picking, cancelling is a conversation and a refund, not a button.
   */
  async cancelOrder(id, { reason = null, customerId = null, isAdmin = false } = {}) {
    try {
      const orderId = assertUuid(id, "order ID");
      const order = await loadOrder(orderId);

      assertVisibleTo(order, { customerId, isAdmin });

      if (order.status === ORDER_STATUS.CANCELLED) {
        throw new ApiError(409, "This order is already cancelled.");
      }

      const cancellableFrom = isAdmin
        ? CANCELLABLE_FROM
        : [ORDER_STATUS.PENDING_PAYMENT];

      if (!cancellableFrom.includes(order.status)) {
        throw new ApiError(
          409,
          isAdmin
            ? `An order that is ${order.status.replace(/_/g, " ")} cannot be cancelled — it has already been dispatched.`
            : "This order is already being prepared. Contact the shop to cancel it.",
        );
      }

      const row = await OrderRepository.cancel(orderId, {
        reason: trimOrNull(reason),
        cancellableFrom,
      });

      if (!row) {
        throw new ApiError(
          409,
          "This order changed while the screen was open. Reload and try again.",
        );
      }

      const updated = await OrderRepository.findById(orderId);

      logger.info("Order cancelled", {
        orderId,
        orderNumber: updated?.order_number,
        byAdmin: isAdmin,
      });

      return isAdmin
        ? OrderMapper.toDTO(updated)
        : OrderMapper.toCustomerDTO(updated);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("OrderService.cancelOrder failed", {
        orderId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to cancel the order");
    }
  },
};
