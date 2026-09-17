// src/routes/whatsapp.routes.js
//
// Meta's callback URL (F-12).
//
// One path, two methods, no tokens — the shape /payments/webhook already
// has, for the same reason: the caller is a third party that holds no
// credential of ours. What stands in for one is an HMAC over the body,
// checked in notification.service.js against WHATSAPP_APP_SECRET.
//
// The whole router is mounted only when both inbound credentials are
// configured (see routes/index.js). A receipt that cannot be verified is
// not a receipt, and an endpoint that would accept one is worse than no
// endpoint at all.
//
// Registered in the Meta dashboard as:
//
//   https://<host>/api/whatsapp/webhook
//
// subscribed to the `messages` field, which is the one that carries
// delivery receipts. Everything else it might send is acknowledged and
// ignored.
//
// Like the Razorpay webhook it carries only the global limiter. Meta
// batches receipts and retries what it cannot deliver, so a tight limit
// here would turn a burst of orders into a subscription Meta eventually
// switches off — and the signature check rejects a forged body long
// before anything touches the database.

import express from "express";

import { WhatsAppController } from "../controllers/whatsapp.controller.js";

const router = express.Router();

/** The subscription handshake. Pressed once, in the dashboard. */
router.get("/webhook", WhatsAppController.verify);

/** Delivery receipts. Meta, server to server. */
router.post("/webhook", WhatsAppController.receipts);

export default router;
