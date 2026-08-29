import { Suspense } from "react";

import { ProductShowcase } from "@/components/store/ProductShowcase";
import { FabricStrip } from "@/components/store/Promos";
import { ShopFilterSync } from "@/components/store/ShopFilterSync";
import { getFabrics, getStorefrontCategories, getStorefrontProducts } from "@/lib/store/catalogue";

export const metadata = {
  title: "The Shop",
  description:
    "The whole Salwar Butterfly shelf — salwar suits, co-ord sets and anarkalis in dhabu cotton, azrak block print, Chanderi silk and south cotton. Filter by collection, fabric or size.",
};

/**
 * The catalogue as its own route (F-06 Product Browsing).
 *
 * The home page keeps its shop section for shoppers who scroll; this is the
 * destination every header link points at, so the nav works identically from
 * the bag, the wishlist or the account page — none of which have a grid to
 * scroll to. The filter is carried in the query string and read back by
 * <ShopFilterSync>: `?tab=`, `?category=`, `?fabric=`, `?q=`.
 */
export default function ShopPage() {
  const products = getStorefrontProducts();
  const categories = getStorefrontCategories(products);
  const fabrics = getFabrics(products);

  return (
    <>
      {/* Reading the query string opts this subtree out of prerendering, so it
          is fenced off on its own — it renders nothing either way. */}
      <Suspense fallback={null}>
        <ShopFilterSync categoryIds={categories.map((category) => category.id)} />
      </Suspense>

      <div className="pt-6 sm:pt-8">
        <FabricStrip fabrics={fabrics} />
      </div>
      <ProductShowcase products={products} categories={categories} />
    </>
  );
}
