// src/queues/email.sweeper.js
//
// The floor under the email outbox — the counterpart to
// notification.sweeper.js, and there for the same failures: a process
// killed between the commit and the dispatch, one killed mid-send, and a
// retryable failure whose backoff has expired.

import * as Sentry from "@sentry/node";

import { env } from "../config/env.js";
import { EmailRepository } from "../repository/email.repository.js";
import { EmailService } from "../services/email.service.js";
import { logger } from "../utils/logger.js";

const SWEEP_INTERVAL_MS = 60_000;

const SWEEP_BATCH = 25;

/** @type {NodeJS.Timeout | null} */
let timer = null;

let sweeping = false;

/** One pass. Swallows everything, so the interval never dies. */
export async function sweepEmailsOnce() {
  if (!env.email.enabled) return 0;
  if (sweeping) return 0;

  sweeping = true;

  try {
    const due = await EmailRepository.findDue(SWEEP_BATCH);

    if (due.length === 0) return 0;

    logger.debug("Sweeping unsent emails", { count: due.length });

    for (const id of due) {
      await EmailService.deliver(id);
    }

    return due.length;
  } catch (error) {
    logger.error("Email sweep failed", error);

    Sentry.captureException(error, {
      tags: { feature: "email-notifications", phase: "sweep" },
    });

    return 0;
  } finally {
    sweeping = false;
  }
}

/** Called unconditionally from server.js; a no-op without RESEND_API_KEY. */
export function startEmailSweeper() {
  if (!env.email.enabled) return null;
  if (timer) return timer;

  timer = setInterval(() => {
    sweepEmailsOnce().catch(() => {});
  }, SWEEP_INTERVAL_MS);

  timer.unref();

  return timer;
}

export function stopEmailSweeper() {
  if (!timer) return;

  clearInterval(timer);
  timer = null;
}
