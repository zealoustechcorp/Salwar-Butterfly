// src/config/email.gateway.js
//
// The one place an email leaves this process.
//
// Resend's REST API over fetch rather than their SDK: it is a single
// POST, and owning the call means owning its timeout and its error
// classification, the same reasons whatsapp.gateway.js gives.
//
// Unlike Meta's /messages, Resend accepts an Idempotency-Key. Every send
// carries one, so a retry after a timeout — the case WhatsApp has to
// treat as "maybe delivered, never retry" — is safe here: Resend collapses
// the repeat into the original for 24 hours.

import { env } from "./env.js";

const RESEND_URL = "https://api.resend.com/emails";

/** Resend answers in well under a second; ten is generous. */
const SEND_TIMEOUT_MS = 10_000;

export class EmailSendError extends Error {
  constructor(message, { retryable, code = null, httpStatus = null, misconfigured = false } = {}) {
    super(message);
    this.name = "EmailSendError";
    this.retryable = Boolean(retryable);
    this.code = code;
    this.httpStatus = httpStatus;
    // A bad key or an unverified sender stops every email at once, which
    // is worth an alert where one bounced address is not.
    this.misconfigured = Boolean(misconfigured);
  }
}

/**
 * Sends one email.
 *
 * @param {object} params
 * @param {string|string[]} params.to
 * @param {string} params.subject
 * @param {string} params.html
 * @param {string} params.text
 * @param {string} [params.idempotencyKey]
 * @returns {Promise<{id: string|null}>}
 * @throws {EmailSendError}
 */
export async function sendEmail({ to, subject, html, text, idempotencyKey = null }) {
  if (!env.email.enabled) {
    throw new EmailSendError("Email is not configured (RESEND_API_KEY missing)", {
      retryable: false,
      code: "NOT_CONFIGURED",
      misconfigured: true,
    });
  }

  // Test mode: enforced here, at the single exit, so there is no path
  // around it. The outbox row keeps the address the email was *for*.
  const recipients = env.email.testRecipient
    ? [env.email.testRecipient]
    : (Array.isArray(to) ? to : [to]);

  const headers = {
    Authorization: `Bearer ${env.email.resendApiKey}`,
    "Content-Type": "application/json",
  };

  if (idempotencyKey) headers["Idempotency-Key"] = String(idempotencyKey).slice(0, 256);

  let response;

  try {
    response = await fetch(RESEND_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: env.email.from,
        to: recipients,
        subject,
        html,
        text,
        ...(env.email.replyTo ? { reply_to: env.email.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (error) {
    // Timeout or network failure. Retryable: the idempotency key makes a
    // repeat harmless even if the first attempt did land.
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";

    throw new EmailSendError(
      timedOut ? `No answer from Resend within ${SEND_TIMEOUT_MS}ms` : `Network error: ${error?.message}`,
      { retryable: true, code: timedOut ? "TIMEOUT" : "NETWORK" },
    );
  }

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok) {
    return { id: payload?.id ?? null };
  }

  const detail = payload?.message || payload?.error || `HTTP ${response.status}`;
  const code = String(payload?.name || `HTTP_${response.status}`).slice(0, 32);

  // 401/403: a bad key, or a sender/recipient Resend will not allow
  // (an unverified domain answers 403). Retrying changes nothing.
  if (response.status === 401 || response.status === 403) {
    throw new EmailSendError(detail, {
      retryable: false,
      code,
      httpStatus: response.status,
      misconfigured: true,
    });
  }

  // Throttled, or Resend is unwell. Worth another go after a backoff.
  if (response.status === 429 || response.status >= 500) {
    throw new EmailSendError(detail, { retryable: true, code, httpStatus: response.status });
  }

  // 400/422 and the rest: this email, as written, will never be accepted.
  throw new EmailSendError(detail, { retryable: false, code, httpStatus: response.status });
}

export const EmailGateway = { send: sendEmail };
