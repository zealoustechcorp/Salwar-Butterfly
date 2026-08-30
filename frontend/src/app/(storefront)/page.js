import { CategoryGrid } from "@/components/store/CategoryGrid";
import { Hero } from "@/components/store/Hero";
import { PolicySection, StorySection, TrustBar } from "@/components/store/HomeSections";
import { ProductShowcase } from "@/components/store/ProductShowcase";
import { FabricStrip, FollowSection, OfferBanner } from "@/components/store/Promos";
import { getHomePageData } from "@/lib/store/catalogue";

/**
 * Storefront home (F-06 Product Browsing).
 *
 * Rendered on the server from the live catalogue — real products, real prices
 * and real per-size stock, read from the API and cached for a minute (see
 * lib/store/catalogue.js). The whole catalogue ships to the client once and
 * every control on the page filters that one list, so browsing by category,
 * fabric or search term costs no further requests.
 */
export default async function StorefrontHome() {
  const {
    shop,
    products,
    categories,
    fabrics,
    topDiscount,
    offerCount,
    catalogueSize,
    sizeRange,
  } = await getHomePageData();

  return (
    <>
      <Hero shop={shop} topDiscount={topDiscount} />
      <TrustBar shop={shop} />
      <CategoryGrid categories={categories} />
      <FabricStrip fabrics={fabrics} />
      <ProductShowcase products={products} categories={categories} />
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
