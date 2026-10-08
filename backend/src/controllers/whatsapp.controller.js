// src/controllers/whatsapp.controller.js
//
// Meta's side of the conversation.
//
// Two endpoints that share a URL and have almost nothing else in common:
//
//   GET   the subscription handshake. Called once, by a human pressing
//         "Verify and save" in the Meta dashboard, and then never again
//         unless the callback URL is changed. Answers in plain text.
//   POST  the delivery receipts. Called for the rest of the deployment's
//         life, by Meta, signed with the app secret.
//
// Both are unauthenticated, because Meta holds no token of ours to send.
// The POST's credential is an HMAC over its exact bytes; the GET's is a
// string we invented and gave to the dashboard, which proves only that
// whoever is calling was told it.

import { NotificationService } from "../services/notification.service.js";
import { verifyTokenMatches } from "../config/whatsapp.policy.js";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { okResponse } from "../utils/apiResponse.js";
import { logger } from "../utils/logger.js";

export const WhatsAppController = {
  /**
   * GET /api/whatsapp/webhook
   *
   * The handshake. Meta calls this the moment the callback URL is saved,
   * with three query parameters, and subscribes the webhook only if the
   * response body is `hub.challenge` and nothing else.
   *
   * `res.send` with the bare challenge, therefore — not okResponse. The
   * envelope every other endpoint in this API returns would be a
   * perfectly well-formed 200 that fails verification, which is a
   * genuinely confusing afternoon.
   *
   * The challenge is echoed as a string. Meta sends a number and expects
   * it back verbatim; `res.send` on a JavaScript number would be read as
   * an HTTP status code, which is Express's oldest trap.
   */
  verify: asyncHandler(async (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode !== "subscribe" || !verifyTokenMatches(token, env.whatsapp.verifyToken)) {
      logger.warn("WhatsApp webhook verification rejected", {
        mode: mode ?? null,
        configured: Boolean(env.whatsapp.verifyToken),
      });

      // 403 is what Meta's own documentation asks for here, and the
      // dashboard renders it as "the callback URL or verify token
      // couldn't be validated" rather than as a server fault.
      throw ApiError.forbidden(
        "Webhook verification failed",
        "WHATSAPP_VERIFY_TOKEN_INVALID",
      );
    }

    logger.info("WhatsApp webhook verified");

    return res.status(200).type("text/plain").send(String(challenge ?? ""));
  }),

  /**
   * POST /api/whatsapp/webhook
   *
   * Delivery receipts, server to server.
   *
   * `req.rawBody` is the unparsed buffer app.js kept for this route — the
   * signature is over those exact bytes.
   *
   * 200 on anything that verified, including receipts for messages this
   * system never sent and fields it does not handle. Meta retries a
   * non-2xx with growing backoff and disables a subscription that keeps
   * failing, so being right about an event we are deliberately ignoring
   * is worth nothing and costs the subscription.
   *
   * Applied inline rather than queued, unlike the Razorpay webhook. The
   * reasons that put payments on a queue do not hold here: a receipt is
   * one guarded UPDATE by indexed key, it carries no money, and losing
   * one costs a `sent` row that never advances to `delivered`. A queue
   * would be more machinery than the thing it protects.
   */
  receipts: asyncHandler(async (req, res) => {
    const body = NotificationService.verifyReceiptDelivery({
      rawBody: req.rawBody,
      signature: req.get("x-hub-signature-256"),
    });

    const result = await NotificationService.applyReceipts(body);

    return okResponse({
      res,
      data: result,
      message: "Receipts received",
    });
  }),
};
