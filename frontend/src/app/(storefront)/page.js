import { CategoryGrid } from "@/components/store/CategoryGrid";
import { CustomerStories } from "@/components/store/CustomerStories";
import { Hero } from "@/components/store/Hero";
import { PolicySection, StorySection, TrustBar } from "@/components/store/HomeSections";
import { ProductShowcase } from "@/components/store/ProductShowcase";
import { FabricStrip, FollowSection, OfferBanner } from "@/components/store/Promos";
import { getBanners } from "@/lib/store/banners";
import { getHomePageData } from "@/lib/store/catalogue";
import { getCustomerStories } from "@/lib/store/customerStories";

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
      topDiscount,
      offerCount,
      catalogueSize,
      sizeRange,
      rating,
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
      <Hero banners={banners} topDiscount={topDiscount} rating={rating} />
      <TrustBar shop={shop} />
      <CategoryGrid categories={categories} />
      <FabricStrip fabrics={fabrics} />
      <ProductShowcase products={products} categories={categories} />
      {/* After the products and before the offer band: social proof lands
          best once a visitor has seen what is being sold and before they
          are asked to act on it. Renders nothing when the shop has
          published no stories. */}
      <CustomerStories stories={stories} />
      <OfferBanner topDiscount={topDiscount} offerCount={offerCount} />
      <StorySection
        catalogueSize={catalogueSize}
        categoryCount={categories.length}
        sizeRange={sizeRange}
      />
      <PolicySection />
      <FollowSection shop={shop} />
    </>
  );
}
