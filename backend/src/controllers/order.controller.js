// src/controllers/order.controller.js

import { OrderService } from "../services/order.service.js";
import { ADMIN_TOKEN_TYPE } from "../services/admin.auth.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import { createdResponse, okResponse, successResponse } from "../utils/apiResponse.js";

/**
 * Who is asking, from the token and nowhere else.
 *
 * Every method that can serve somebody else's data goes through this
 * rather than reading req.user itself — one place decides what "admin"
 * means, and one place is one thing to get right.
 *
 * `customerId` is null for an admin and for an unauthenticated guest;
 * the two are told apart by `isAdmin`, and the service refuses a
 * non-admin listing with no customer id rather than serving the lot.
 */
const identify = (req) => {
  const isAdmin = req.user?.typ === ADMIN_TOKEN_TYPE;

  return {
    isAdmin,
    customerId: isAdmin ? null : (req.user?.id ?? null),
  };
};

export const OrderController = {
  // ==========================================================
  // STOREFRONT
  // ==========================================================

  /**
   * Checkout (F-07.01).
   *
   * The route is open to guests, so req.user may be absent — that is a
   * guest order, not an error. What is never read is a customer id from
   * the body: where an order belongs comes from the token.
   */
  place: asyncHandler(async (req, res) => {
    try {
      const { contact, shippingAddress, items, customerNote, whatsappOptIn } = req.body;
      const { customerId } = identify(req);

      logger.info("Place order endpoint called", {
        lines: items?.length,
        guest: !customerId,
      });

      const order = await OrderService.placeOrder({
        customerId,
        contact,
        shippingAddress,
        items,
        customerNote,
        whatsappOptIn,
      });

      return createdResponse({
        res,
        data: order,
        message: `Order ${order.orderNumber} placed successfully`,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Place order endpoint error", { error: error?.message });

      throw new ApiError(500, "Failed to place the order");
    }
  }),

  /** The shopper's own orders (F-07.02). */
  getMyOrders: asyncHandler(async (req, res) => {
    try {
      const { customerId } = identify(req);
      const { status, sort, page = 1, limit = 25 } = req.query;

      logger.info("My orders endpoint called", { customerId, status });

      const result = await OrderService.listOrders({
        customerId,
        isAdmin: false,
        status,
        sort,
        page,
        limit,
      });

      return successResponse({
        res,
        data: result.data,
        meta: { pagination: result.pagination },
        message: "Orders retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("My orders endpoint error", { error: error?.message });

      throw new ApiError(500, "Failed to fetch orders");
    }
  }),

  /**
   * Tracking without an account.
   *
   * A POST rather than a GET despite reading nothing, because the email
   * is a credential here — in a query string it lands in access logs,
   * browser history and any proxy in between.
   */
  track: asyncHandler(async (req, res) => {
    try {
      const { orderNumber, email } = req.body;

      logger.info("Track order endpoint called", { orderNumber });

      const order = await OrderService.trackOrder({ orderNumber, email });

      return okResponse({
        res,
        data: order,
        message: "Order retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Track order endpoint error", { error: error?.message });

      throw new ApiError(500, "Failed to look up the order");
    }
  }),

  // ==========================================================
  // SHARED — admin sees any order, a shopper sees their own
  // ==========================================================

  getById: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const { customerId, isAdmin } = identify(req);

      logger.info("Get order endpoint called", { orderId: id, isAdmin });

      const order = await OrderService.getOrderById(id, { customerId, isAdmin });

      return okResponse({
        res,
        data: order,
        message: "Order retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get order endpoint error", {
        orderId: req.params?.id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch the order");
    }
  }),

  /**
   * Cancelling (F-07.05).
   *
   * The same endpoint for both, because it is the same act with the
   * same consequence for stock. What differs is how far along an order
   * may be and still be cancelled, and that is the service's call —
   * a shopper's window closes when the shop starts picking.
   */
  cancel: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body ?? {};
      const { customerId, isAdmin } = identify(req);

      logger.info("Cancel order endpoint called", { orderId: id, isAdmin });

      const order = await OrderService.cancelOrder(id, {
        reason,
        customerId,
        isAdmin,
      });

      return okResponse({
        res,
        data: order,
        message: `Order ${order.orderNumber} cancelled`,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Cancel order endpoint error", {
        orderId: req.params?.id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to cancel the order");
    }
  }),

  // ==========================================================
  // ADMIN
  // ==========================================================

  getAll: asyncHandler(async (req, res) => {
    try {
      const {
        status,
        paymentStatus,
        search,
        sort,
        page = 1,
        limit = 25,
      } = req.query;

      logger.info("Get all orders endpoint called", { status, page });

      const result = await OrderService.listOrders({
        isAdmin: true,
        status,
        paymentStatus,
        search,
        sort,
        page,
        limit,
      });

      return successResponse({
        res,
        data: result.data,
        meta: { pagination: result.pagination },
        message: "Orders retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get all orders endpoint error", { error: error?.message });

      throw new ApiError(500, "Failed to fetch orders");
    }
  }),

  getSummary: asyncHandler(async (req, res) => {
    try {
      logger.info("Order summary endpoint called");

      const summary = await OrderService.getSummary();

      return okResponse({
        res,
        data: summary,
        message: "Order summary retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Order summary endpoint error", { error: error?.message });

      throw new ApiError(500, "Failed to fetch the order summary");
    }
  }),

  confirmPayment: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const { reference } = req.body ?? {};

      logger.info("Confirm payment endpoint called", { orderId: id });

      const order = await OrderService.confirmPayment(id, { reference });

      return okResponse({
        res,
        data: order,
        message: `Order ${order.orderNumber} confirmed — payment received`,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Confirm payment endpoint error", {
        orderId: req.params?.id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to confirm the payment");
    }
  }),

  changeStatus: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const { status, note, shipment } = req.body;

      logger.info("Change order status endpoint called", {
        orderId: id,
        status,
      });

      // `shipment` is built by validateStatusChange — present only when
      // marking packed, where the tracking email needs it.
      const order = await OrderService.changeStatus(id, status, { note, shipment });

      return okResponse({
        res,
        data: order,
        message: `Order ${order.orderNumber} marked ${status.replace(/_/g, " ")}`,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Change order status endpoint error", {
        orderId: req.params?.id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update the order");
    }
  }),
};
