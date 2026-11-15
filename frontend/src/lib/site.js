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
 * page uses its photo). A copy of public/Salwar Butterfly.jpeg under a name
 * with no space, so the URL crawlers fetch needs no escaping. 221 KB, under
 * the ~300 KB past which WhatsApp drops the image.
 *
 * Relative; `metadataBase` in the root layout makes it absolute.
 */
export const SHARE_LOGO = {
  url: "/share-logo.jpg",
  width: 1254,
  height: 1254,
  type: "image/jpeg",
  alt: "Salwar Butterfly",
};
