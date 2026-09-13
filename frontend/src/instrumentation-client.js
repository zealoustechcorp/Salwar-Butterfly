/**
 * Browser instrumentation hook (Next 16 file convention).
 *
 * This file runs after the HTML has loaded and before React hydrates,
 * which is the only window early enough to catch an error thrown during
 * hydration itself — the class of bug that shows a shopper a blank page
 * and leaves no trace in any server log.
 *
 * Session recording is deliberately *not* turned on here. Sentry ships
 * a Replay integration that does much the same job as Microsoft
 * Clarity, and running both would mean two recorders on every page,
 * two sets of masking rules to keep in step, and two copies of the same
 * session leaving the browser. Clarity is the one this shop uses (see
 * components/store/Clarity.js); Sentry is here for errors.
 *
 * Next runs this on every page including /admin, so anything added here
 * is added to the admin panel too.
 */

import * as Sentry from "@sentry/nextjs";

import { sentryEnabled, sharedSentryOptions } from "@/lib/monitoring/sentry";

if (sentryEnabled) {
  Sentry.init({
    ...sharedSentryOptions,

    // ==========================================================
    // NOISE
    // ==========================================================
    //
    // A storefront is open to every browser on the internet, and a
    // fair share of what a browser SDK hears is not the site's fault.
    // Left unfiltered these are the bulk of the events, and the real
    // bugs sit underneath them.

    ignoreErrors: [
      // Fired when a user navigates away mid-fetch, or a tab sleeps.
      // Indistinguishable from a cancelled request, which is normal.
      "AbortError",
      "The operation was aborted",

      // Extensions, in-app browsers and translation tools injecting
      // scripts into the page.
      "top.GLOBALS",
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
    ],

    denyUrls: [/extensions\//i, /^chrome:\/\//i, /^chrome-extension:\/\//i, /^moz-extension:\/\//i],

    beforeSend(event, hint) {
      // The API client raises this when the request never reached the
      // backend — the server is down, or the browser is offline. It is
      // worth a toast on screen, which it already gets, but it is not a
      // bug in the shop and a flat connection reports one per call.
      if (hint?.originalException?.code === "NETWORK_ERROR") {
        return null;
      }

      return event;
    },
  });
}

// ============================================================
// NAVIGATION
// ============================================================
//
// App Router navigations do not reload the page, so without this hook
// every error after the first click is still filed against the URL the
// visitor landed on. Sentry's handler starts a new span per navigation;
// the SDK logs a warning at build time if it is missing.

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
