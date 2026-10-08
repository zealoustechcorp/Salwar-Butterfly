/**
 * Server-side instrumentation hook (Next 16 file convention).
 *
 * `register` runs once per server instance, before the first request is
 * served. The two Sentry configs are imported here rather than at the
 * top of the file because each one only belongs in one runtime: the
 * node build must not pull in the edge bundle, or vice versa, and a
 * static import would put both in both.
 *
 * `onRequestError` is the part that matters most. Next catches errors
 * thrown while rendering a server component or running a route handler
 * and turns them into the error page — by the time anything else could
 * see them they are gone, so without this hook a broken product page
 * reports nothing at all. Sentry's `captureRequestError` takes the
 * error together with the request and the route that produced it.
 */

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
