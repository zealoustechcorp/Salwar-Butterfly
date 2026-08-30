import { Suspense } from "react";

import { ProductShowcase } from "@/components/store/ProductShowcase";
import { ShopFilters } from "@/components/store/ShopFilters";
import { ShopFilterSync } from "@/components/store/ShopFilterSync";
import {
  getFabrics,
  getSizes,
  getStorefrontCategories,
  getStorefrontProducts,
} from "@/lib/store/catalogue";

export const metadata = {
  title: "The Shop",
  description:
    "The whole Salwar Butterfly shelf — salwar suits, co-ord sets and anarkalis in dhabu cotton, azrak block print, Chanderi silk and south cotton. Filter by collection, fabric, size, price or rating.",
};

/**
 * The catalogue as its own route (F-06 Product Browsing).
 *
 * The home page keeps its shop section for shoppers who scroll; this is the
 * destination every header link points at, so the nav works identically from
 * the bag, the wishlist or the account page — none of which have a grid to
 * scroll to. The filter is carried in the query string and read back by
 * <ShopFilterSync>: `?tab=`, `?category=`, `?fabric=`, `?size=`, `?q=`.
 *
 * The fabric strip that used to sit above the grid here is gone: fabric is one
 * of six dimensions in the rail now, and a second set of fabric controls that
 * could disagree with it on screen is worse than one that cannot.
 *
 * The whole catalogue is shipped to the browser and filtered there, which is
 * what the rail's live counts are built on. That is a deliberate trade at this
 * size — a couple of hundred pieces is a small payload and it buys instant,
 * requestless filtering; a shop an order of magnitude larger would have to
 * push this back to the API.
 */
export default async function ShopPage() {
  const products = await getStorefrontProducts();
  const categories = await getStorefrontCategories(products);
  const fabrics = await getFabrics(products);
  const sizes = await getSizes(products);

  return (
    <>
      {/* Reading the query string opts this subtree out of prerendering, so it
          is fenced off on its own — it renders nothing either way. */}
      <Suspense fallback={null}>
        <ShopFilterSync
          categoryIds={categories.map((category) => category.id)}
          fabricNames={fabrics.map((fabric) => fabric.name)}
          sizeLabels={sizes}
        />
      </Suspense>

      <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6 sm:py-11 lg:px-8 lg:py-13">
        {/* Stacked on a phone — the rail is a drawer there and its trigger is
            the first thing in the column — and side by side from `lg`, which
            is the first width where taking 15rem for the rail still leaves
            room for three cards. */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
          <ShopFilters
            products={products}
            categories={categories}
            fabrics={fabrics}
            sizes={sizes}
          />

          {/* `min-w-0` or the grid's widest card sets the column's width and
              pushes the rail off the page. */}
          <div className="min-w-0 flex-1">
            <ProductShowcase products={products} categories={categories} withSidebar />
          </div>
        </div>
      </div>
    </>
  );
}
