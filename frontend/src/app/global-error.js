"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * The last error boundary there is.
 *
 * Next's other boundaries sit inside the root layout, so an error
 * thrown by the layout itself — or by the providers it mounts — falls
 * past all of them. What the visitor sees then is an unstyled default
 * page, and what Sentry sees, without this file, is nothing: the
 * server-side hook in instrumentation.js does not run for an error
 * React hit while rendering in the browser.
 *
 * This replaces the whole document when it renders, which is why it
 * carries its own <html> and <body> — there is no layout above it left
 * to supply them, and that also means none of the storefront's fonts or
 * ground colours are available here. Plain styles on purpose.
 *
 * `reset` re-renders the tree that failed. It is offered rather than a
 * link home because most of what lands here is transient — a chunk that
 * failed to load after a deploy, a hydration mismatch — and trying
 * again is the fix.
 */
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          background: "#faf7f2",
          color: "#2b2521",
          fontFamily: "system-ui, -apple-system, sans-serif",
          textAlign: "center",
        }}
      >
        <main>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
            Something went wrong
          </h1>

          <p style={{ marginTop: "0.75rem", opacity: 0.75 }}>
            The page could not be loaded. We have been told about it.
          </p>

          {/* The digest is what ties this screen to the report Sentry
              received — worth showing, because a customer quoting it is
              the fastest way to find their error among everyone else's. */}
          {error?.digest ? (
            <p style={{ marginTop: "0.5rem", fontSize: "0.75rem", opacity: 0.5 }}>
              Reference: {error.digest}
            </p>
          ) : null}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.6rem 1.5rem",
              border: "1px solid #2b2521",
              borderRadius: "9999px",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
