/**
 * The options every Sentry entry point shares.
 *
 * Next.js initialises Sentry three times over — once in the browser
 * (src/instrumentation-client.js), once in the node server and once in
 * the edge runtime (sentry.server.config.js / sentry.edge.config.js,
 * both loaded from src/instrumentation.js). They are separate processes
 * with separate bundles, so there is no way to init once and be done;
 * what there is a way to do is keep the three from drifting, which is
 * what this file is for.
 *
 * Everything is read from NEXT_PUBLIC_* variables because the browser
 * build needs them inlined, and none of them is a secret: a DSN is a
 * write-only ingest URL and is meant to ship in the bundle. The one
 * genuine secret in this setup is SENTRY_AUTH_TOKEN, which is used at
 * build time only and never named here.
 *
 * With no DSN set, `enabled` is false and no entry point calls init.
 * That is the normal state locally — errors go to the terminal and the
 * browser console the way they always have.
 */

// ============================================================
// DSN
// ============================================================

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

export const sentryEnabled = Boolean(dsn);

// ============================================================
// ENVIRONMENT
// ============================================================
//
// Separate from NODE_ENV, which a Next build only ever reports as
// "development" or "production" — a staging deploy and the live shop
// are both the latter, and they want different inboxes.

const environment =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
  (process.env.NODE_ENV === "production" ? "production" : "development");

// ============================================================
// SAMPLE RATE
// ============================================================

/**
 * Env vars are strings, and a typo should not become NaN halfway into a
 * Sentry option where it turns into "sampled nothing, silently".
 *
 * @param {string|undefined} value
 * @param {number} fallback
 */
const rate = (value, fallback) => {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return fallback;
  }

  return parsed;
};

// ============================================================
// SHARED OPTIONS
// ============================================================

export const sharedSentryOptions = {
  dsn,

  environment,

  // The commit the bundle was built from, when the deploy knows it.
  // Sentry needs it to match an error against uploaded source maps.
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,

  // Off unless asked for: traces are billed per transaction, errors
  // are not.
  tracesSampleRate: rate(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, 0),

  // No IPs, no cookies, no request bodies. The shop's own error reports
  // do not need to carry a shopper's address to be useful, and Clarity
  // already covers "what was the customer doing" — with its own masking
  // rules and its own consent story.
  sendDefaultPii: false,

  // Quiet unless something is wrong with Sentry itself. Turn on with
  // NEXT_PUBLIC_SENTRY_DEBUG=1 when a report is not arriving and the
  // question is whether it was ever sent.
  debug: process.env.NEXT_PUBLIC_SENTRY_DEBUG === "1",
};
