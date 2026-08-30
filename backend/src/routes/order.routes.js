// src/routes/order.routes.js
//
// Orders (F-07) — the route file that ends the WhatsApp hand-off.
//
// Unlike the catalogue routers, this one cannot be blanket-guarded at
// the mount: it is three audiences at once. A guest places an order, a
// signed-in shopper reads their own, and the shop reads and moves all of
// them. So the guards live route by route here, the way
// customer.routes.js does, and each one carries the reason next to it.

import express from "express";

import { OrderController } from "../controllers/order.controller.js";

import {
  authenticate,
  authenticateOptional,
} from "../middlewares/auth.middleware.js";
import {
  requireAdmin,
  requireCustomer,
} from "../middlewares/authorize.middleware.js";
import {
  authRateLimiter,
  checkoutRateLimiter,
} from "../middlewares/rateLimiter.js";

import {
  validateCancelOrder,
  validateConfirmPayment,
  validateCreateOrder,
  validateOrderIdParam,
  validateOrderQuery,
  validateStatusChange,
} from "../validators/order.validator.js";

const router = express.Router();

// ============================================================
// STOREFRONT
// ============================================================

/**
 * Place an order (F-07.01).
 *
 * `authenticateOptional`, not `authenticate`. The bag page offers
 * checkout without an account and treats signing in as a wishlist
 * feature, so requiring a token here would break a promise the
 * storefront has already made. A token that *is* sent still has to be
 * valid — see the middleware — because silently downgrading an expired
 * one would file a signed-in shopper's order as a guest's, where they
 * could never find it again.
 *
 * The rate limiter is not optional. This route opens a transaction and
 * takes a row lock on every variant in the bag, so it is the one
 * unauthenticated write in the system with a real cost per call.
 */
router.post(
  "/placeOrder",
  checkoutRateLimiter,
  authenticateOptional,
  validateCreateOrder,
  OrderController.place,
);

/**
 * Track an order without an account (F-07.02).
 *
 * A POST although it reads: the email is the second factor here, and a
 * query string ends up in access logs, browser history and every proxy
 * in between.
 *
 * Behind the auth limiter because it is a guessing surface — order
 * numbers run in sequence, so knowing one is knowing where the others
 * are, and the email is the only thing standing between a guess and
 * somebody's address.
 */
router.post("/trackOrder", authRateLimiter, OrderController.track);

/**
 * The shopper's own orders (F-07.02).
 *
 * requireCustomer, not just authenticate: this route reads req.user.id
 * as a customer id, and an admin token would send it looking for a
 * customer row that does not exist.
 */
router.get(
  "/getMyOrders",
  authenticate,
  requireCustomer,
  validateOrderQuery,
  OrderController.getMyOrders,
);

// ============================================================
// ADMIN
// ============================================================

router.get(
  "/getAllOrders",
  authenticate,
  requireAdmin,
  validateOrderQuery,
  OrderController.getAll,
);

// The tiles above the queue. Shares its shape with F-11's dashboard.
router.get(
  "/getOrderSummary",
  authenticate,
  requireAdmin,
  OrderController.getSummary,
);

/**
 * Payment received (F-07.03).
 *
 * An admin route today: the shop sees the transfer and confirms it by
 * hand. When a gateway lands it calls the same service method from a
 * verified webhook, and this route stays as the manual fallback for a
 * transfer that arrives outside the gateway.
 */
router.post(
  "/confirmPayment/:id",
  authenticate,
  requireAdmin,
  validateOrderIdParam,
  validateConfirmPayment,
  OrderController.confirmPayment,
);

// Packed, shipped, delivered (F-07.04). Which moves are legal from
// where is decided in order.policy.js, not here.
router.patch(
  "/updateOrderStatus/:id",
  authenticate,
  requireAdmin,
  validateOrderIdParam,
  validateStatusChange,
  OrderController.changeStatus,
);

// ============================================================
// SHARED — admin sees any order, a shopper sees their own
// ============================================================
//
// `authenticate` alone, with no requireAdmin or requireCustomer:
// both token types are legitimate here and the two are told apart
// inside the service, which is also where the ownership check lives.
// Neither guard could be used — each refuses the other's token.

router.get(
  "/getOrderById/:id",
  authenticate,
  validateOrderIdParam,
  OrderController.getById,
);

/**
 * Cancel (F-07.05).
 *
 * One endpoint for both, because it is one act with one consequence:
 * the stock goes back on the shelf. What differs is how far along an
 * order may be and still be cancelled — a shopper's window closes when
 * the shop starts picking — and that is enforced in the service.
 */
router.post(
  "/cancelOrder/:id",
  authenticate,
  validateOrderIdParam,
  validateCancelOrder,
  OrderController.cancel,
);

export default router;
