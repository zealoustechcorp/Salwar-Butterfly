import { BrowseProvider } from "@/components/store/BrowseProvider";
import { StoreFooter } from "@/components/store/StoreFooter";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreProvider } from "@/components/store/StoreProvider";
import { getShop, getStorefrontCategories } from "@/lib/store/catalogue";

export const metadata = {
  // Absolute: the storefront title is the brand, so it must not pick up the
  // root layout's "%s · Salwar Butterfly" template.
  title: { absolute: "Salwar Butterfly — Fashion Meets Comfort" },
  description:
    "Fashion meets comfort. Dhabu cotton, azrak block print, Chanderi silk and south cotton salwar suits, co-ord sets and anarkalis in sizes 36–46. Free shipping all over India.",
};

/**
 * Customer-facing shell (F-06 storefront). `.sb-root` paints the cream ground
 * so the storefront never inherits the body's dark-mode fallback, and the two
 * providers sit above both the header and the page so the header search can
 * steer the shop grid below it.
 */
export default function StorefrontLayout({ children }) {
  const categories = getStorefrontCategories();
  const shop = getShop();

  return (
    <div className="sb-root flex min-h-screen flex-col font-body">
      <StoreProvider>
        <BrowseProvider>
          <StoreHeader categories={categories} shop={shop} />
          <main className="flex-1">{children}</main>
          <StoreFooter shop={shop} />
        </BrowseProvider>
      </StoreProvider>
    </div>
  );
}
