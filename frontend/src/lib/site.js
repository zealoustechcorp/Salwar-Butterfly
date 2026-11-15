/**
 * The storefront's public origin — what search engines, link previews and
 * the sitemap call this site.
 *
 * Set by NEXT_PUBLIC_SITE_URL. Inlined at build time like every
 * NEXT_PUBLIC_ variable, so it has to be set in the build environment
 * (Hostinger's environment variables), not only at runtime.
 *
 * The site and API are both hosted on Hostinger. Its build does not see
 * .env.production (gitignored), so a production build there baked in
 * localhost, and every og:image, og:url and canonical pointed at
 * http://localhost:3000: shared links unfurled with no picture at all
 * (seen live 2026-11-15). A production build therefore never uses a
 * localhost origin, whether the variable is unset or was copied off
 * .env.example; it falls back to the live address. Localhost is left for
 * a laptop running `next dev`.
 */
const PRODUCTION_ORIGIN = "https://salwarbutterfly.in";

function resolveSiteUrl() {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();

  if (process.env.NODE_ENV !== "production") {
    return configured || "http://localhost:3000";
  }

  let host = "";
  try {
    host = new URL(configured).hostname;
  } catch {
    // Unset or not a URL — fall through to the live address.
  }
  const isLocal = !host || host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
  return isLocal ? PRODUCTION_ORIGIN : configured;
}

export const SITE_URL = resolveSiteUrl().replace(/\/+$/, "");

/**
 * The logo as a link preview's og:image / twitter:image — what any shared
 * URL unfurls with unless its page names a picture of its own (a product
 * page uses its photo).
 *
 * Deliberately small: a 240×240 copy of public/Salwar Butterfly.jpeg
 * (~10 KB). WhatsApp shows an og:image under ~300px wide as a compact
 * square thumbnail beside the title — the LinkedIn-style card — and a large
 * one as a big banner above it. The full 1254px logo (share-logo.jpg) made
 * every admin and home link unfurl as a big logo banner. Kept under a new
 * name because WhatsApp caches previews by image URL; share-logo.jpg is
 * left in public/ so links already shared keep their picture.
 *
 * Relative; `metadataBase` in the root layout makes it absolute.
 */
export const SHARE_LOGO = {
  url: "/share-logo-thumb.jpg",
  width: 240,
  height: 240,
  type: "image/jpeg",
  alt: "Salwar Butterfly",
};

/**
 * The picture a shared product link unfurls with — built by
 * app/(storefront)/product/[slug]/share-image/route.js and named as
 * og:image by that page's generateMetadata.
 *
 * Square, and large: WhatsApp shows a big image card for a picture this
 * size (the Myntra-style preview), and a square card is what lets a 9:16
 * dress photo fill the full height — on the old 1200×630 landscape card it
 * filled only the middle third between two wide blurred bands.
 *
 * `version` is appended to the image URL. WhatsApp caches a preview by
 * image URL, so changing the card's design means bumping this, or links
 * shared before keep unfurling with the old picture.
 */
export const SHARE_CARD = {
  width: 1080,
  height: 1080,
  version: "sq1",
};
