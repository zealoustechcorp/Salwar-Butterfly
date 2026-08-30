import { CategoryGrid } from "@/components/store/CategoryGrid";
import { Hero } from "@/components/store/Hero";
import { PolicySection, StorySection, TrustBar } from "@/components/store/HomeSections";
import { ProductShowcase } from "@/components/store/ProductShowcase";
import { FabricStrip, FollowSection, OfferBanner } from "@/components/store/Promos";
import { getHomePageData } from "@/lib/store/catalogue";

/**
 * Storefront home (F-06 Product Browsing).
 *
 * Rendered on the server from a committed snapshot of the live shop
 * (scripts/snapshot-live-catalogue.mjs) — real products, real prices, real
 * per-size stock and the shop's own photography, with no fetch, no API and no
 * database at runtime. The catalogue ships to the client once and every control
 * on the page filters that one list, so nothing links to a screen that does not
 * exist yet.
 */
export default function StorefrontHome() {
  const {
    shop,
    products,
    categories,
    fabrics,
    topDiscount,
    offerCount,
    catalogueSize,
    sizeRange,
  } = getHomePageData();

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
