import { CategoryGrid } from "@/components/store/CategoryGrid";
import { CustomerStories } from "@/components/store/CustomerStories";
import { Hero } from "@/components/store/Hero";
import { PolicySection, StorySection, TrustBar } from "@/components/store/HomeSections";
import { ProductShowcase } from "@/components/store/ProductShowcase";
import { FabricStrip, FollowSection, OfferBanner } from "@/components/store/Promos";
import { getBanners } from "@/lib/store/banners";
import { getHomePageData } from "@/lib/store/catalogue";
import { getCustomerStories } from "@/lib/store/customerStories";
import { SITE_URL } from "@/lib/site";

/**
 * Storefront home (F-06 Product Browsing).
 *
 * Rendered on the server from the live catalogue — real products, real prices
 * and real per-size stock, read from the API and cached for a minute (see
 * lib/store/catalogue.js). The whole catalogue ships to the client once and
 * every control on the page filters that one list, so browsing by category,
 * fabric or search term costs no further requests.
 *
 * The carousel and the customer stories are separate requests rather than part
 * of that one, and on longer caches: stock is what makes the catalogue stale in
 * a minute, while a banner set changes a few times a season and a story never
 * changes once published. Both are fetched in parallel with the catalogue, so
 * the extra reads cost the page nothing it was not already waiting for.
 */
export default async function StorefrontHome() {
  const [
    {
      shop,
      products,
      categories,
      fabrics,
      offerCount,
    },
    banners,
    stories,
  ] = await Promise.all([
    getHomePageData(),
    getBanners(),
    getCustomerStories(),
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        // JSON.stringify output contains no "</script>", and nothing in it
        // comes from a shopper — the shop's own name, links and logo.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd(shop)) }}
      />
      {/* Banners and nothing else: the hero's copy block — brand line, shop
          buttons and the shop-wide review score — has been removed, so the
          shop-wide `rating` is not read on this page at all any more. It is
          still computed by getHomePageData() and still shown per product;
          putting it back on the home page is a matter of destructuring it
          again. */}
      <Hero banners={banners} />
      <TrustBar shop={shop} />
      <CategoryGrid categories={categories} />
      <FabricStrip fabrics={fabrics} />
      <ProductShowcase products={products} categories={categories} />
      {/* After the products and before the offer band: social proof lands
          best once a visitor has seen what is being sold and before they
          are asked to act on it. Renders nothing when the shop has
          published no stories. */}
      <CustomerStories stories={stories} />
      <OfferBanner offerCount={offerCount} />
      <StorySection />
      <PolicySection />
      <FollowSection shop={shop} />
    </>
  );
}

/**
 * Who the site belongs to, for search engines (schema.org).
 *
 * `WebSite.name` is what Google prints as the site name above a result, and
 * `Organization.logo` is what Google and Bing may show as the brand mark.
 * The logo is the site's own app icon rather than `shop.logo`, which still
 * points at the old Cloudinary account and answers 401.
 */
function siteJsonLd(shop) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: shop.name,
        publisher: { "@id": `${SITE_URL}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE_URL}/shop?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": ["Organization", "OnlineStore"],
        "@id": `${SITE_URL}/#organization`,
        name: shop.name,
        url: SITE_URL,
        logo: `${SITE_URL}/icon.png`,
        email: shop.email,
        telephone: `+91${shop.phone}`,
        sameAs: [shop.instagram].filter(Boolean),
      },
    ],
  };
}
