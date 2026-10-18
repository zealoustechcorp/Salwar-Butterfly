import Link from "next/link";

import { Butterfly } from "@/components/store/Ornaments";

export const metadata = {
  title: "Page not found",
};

/**
 * Any address that matches no route — a mistyped URL, an old link, a path
 * under /admin that does not exist.
 *
 * Root-level, so it renders inside the root layout only: there is no
 * storefront header or footer here to browse from, which is why the way out
 * is on the page itself. A missing product has its own, gentler page inside
 * the storefront shell (product/[slug]/not-found.js).
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center bg-sb-bg px-4 py-16 text-center sm:px-6 sm:py-24">
      <div>
        <Butterfly className="mx-auto size-10 text-sb-maroon-deco" />
        <p className="sb-eyebrow mt-4 text-[10px] text-sb-gold-text">Page Not Found</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
          There is nothing at this address
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-sb-text-muted">
          The link may be old or mistyped. Everything in the shop is still a click away.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/shop"
            className="inline-flex rounded-full bg-sb-btn-primary px-7 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose"
          >
            Browse the shop
          </Link>
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
