"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

import { Butterfly } from "@/components/store/Ornaments";

/**
 * The error boundary for everything under the root layout — including the
 * storefront layout, which awaits the catalogue and throws when the API is
 * down. Before this file, that error fell through to global-error.js, an
 * unstyled page whose only control was "Try again".
 *
 * `retry` re-fetches and re-renders the segment, which is the fix for most
 * of what lands here (a backend that was briefly unreachable). The links
 * are for when it is not.
 */
export default function Error({ error, retry }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center bg-sb-bg px-4 py-16 text-center sm:px-6 sm:py-24">
      <div>
        <Butterfly className="mx-auto size-10 text-sb-maroon-deco" />
        <p className="sb-eyebrow mt-4 text-[10px] text-sb-gold-text">Something Went Wrong</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
          This page could not be loaded
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-sb-text-muted">
          It is usually a passing hiccup — try again in a moment. We have been told about it.
        </p>
        {/* Ties this screen to the Sentry report when a customer quotes it. */}
        {error?.digest ? (
          <p className="mt-2 text-xs text-sb-text-muted/70">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex rounded-full bg-sb-btn-primary px-7 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex rounded-full px-7 py-3 text-sm font-semibold text-sb-heading ring-1 ring-sb-heading/30 transition-colors hover:bg-sb-heading/5"
          >
            Home page
          </Link>
        </div>
      </div>
    </main>
  );
}
