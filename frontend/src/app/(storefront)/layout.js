import { AuthProvider } from "@/components/store/AuthProvider";
import { BrowseProvider } from "@/components/store/BrowseProvider";
import { Clarity } from "@/components/store/Clarity";
import { SizeChartProvider } from "@/components/store/SizeChart";
import { StoreFooter } from "@/components/store/StoreFooter";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreProvider } from "@/components/store/StoreProvider";
import { ToastProvider } from "@/components/store/Toast";
import { getShop, getStorefrontCategories } from "@/lib/store/catalogue";
import { getSizeCharts } from "@/lib/store/sizeCharts";

export const metadata = {
  // Absolute: the storefront title is the brand, so it must not pick up the
  // root layout's "%s · Salwar Butterfly" template.
  title: { absolute: "Salwar Butterfly — Fashion Meets Comfort" },
  description:
    "Fashion meets comfort. Dhabu cotton, azrak block print, Chanderi silk and south cotton salwar suits, co-ord sets and anarkalis in sizes 36–46. Free shipping all over India.",
};

/**
 * Customer-facing shell (F-06 storefront). `.sb-root` paints the cream ground
 * so the storefront never inherits the body's dark-mode fallback, and the three
 * providers sit above both the header and the page so the header search can
 * steer the shop grid below it.
 *
 * <ToastProvider> is outermost so that everything below it — the sign-in
 * dialog included — can put up a notice. It holds no state of its own beyond
 * the queue on screen, so nothing depends on where it sits other than being
 * above whoever pushes to it.
 *
 * <AuthProvider> is next because the header, the account page and the
 * wishlist all need to know who is signed in, and because it renders the sign-in
 * dialog that any of them can open.
 *
 * The size charts (F-06) are fetched here rather than in the pages that show
 * them, because the chart dialog opens from four places — the product page,
 * every product tile, the bag and the account page — and this is the only
 * component above all four. One request per render serves all of them; a null
 * means the read failed, and <SizeChartProvider> decides what to do about it.
 */
export default async function StorefrontLayout({ children }) {
  const [categories, sizeCharts] = await Promise.all([
    getStorefrontCategories(),
    getSizeCharts(),
  ]);
  const shop = getShop();

  return (
    <div className="sb-root flex min-h-screen flex-col font-body">
      <ToastProvider>
        <AuthProvider>
          <StoreProvider>
            <BrowseProvider>
              <SizeChartProvider charts={sizeCharts}>
                <StoreHeader categories={categories} shop={shop} />
                <main className="flex-1">{children}</main>
                <StoreFooter shop={shop} />
              </SizeChartProvider>
            </BrowseProvider>
          </StoreProvider>
        </AuthProvider>
      </ToastProvider>

      {/* Storefront only — see the note in Clarity.js on why /admin is
          left out. Renders nothing without a project id. */}
      <Clarity />
    </div>
  );
}
