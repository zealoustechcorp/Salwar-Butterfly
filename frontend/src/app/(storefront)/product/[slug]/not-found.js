import Link from "next/link";

import { Butterfly } from "@/components/store/Ornaments";

/**
 * The tab title for a missing piece.
 *
 * Exported here rather than relied on from the page's generateMetadata: once
 * the page calls notFound(), Next resolves metadata for the not-found
 * boundary (layouts, then this file) and the page's own "Piece not found"
 * never reaches the head, so the tab showed the site's default title. Next
 * adds the noindex itself for a 404.
 */
export const metadata = {
  title: "Piece not found",
  description:
    "That piece is no longer on the Salwar Butterfly shelf. Browse the rest of the shop.",
};

/**
 * An id that is not in the catalogue — an old link, a run that has since been
 * removed, or a hand-typed URL. It renders inside the storefront shell, so the
 * header and footer are still there to browse from.
 */
export default function ProductNotFound() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 sm:py-24 lg:px-8">
      <Butterfly className="mx-auto size-10 text-sb-maroon-deco" />
      <p className="sb-eyebrow mt-4 text-[10px] text-sb-gold-text">Not On The Shelf</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
        We could not find that piece
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-sb-text-muted">
        Runs here are short, so a piece that was linked a while ago may already be gone. The rest of
        the shelf is still waiting.
      </p>
      <Link
        href="/shop"
        className="mt-6 inline-flex rounded-full bg-sb-btn-primary px-7 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose"
      >
        Browse the shop
      </Link>
    </section>
  );
}
