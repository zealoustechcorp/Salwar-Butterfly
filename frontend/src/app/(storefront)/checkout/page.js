import { CheckoutView } from "@/components/store/CheckoutView";
import { getShop, getStorefrontProducts } from "@/lib/store/catalogue";

export const metadata = {
  title: "Checkout",
  description:
    "Place your Salwar Butterfly order. Free shipping all over India, no account needed.",
  // An order form has nothing to offer a search engine, and the page only
  // exists for someone who already has a bag.
  robots: { index: false, follow: true },
};

export default async function CheckoutPage() {
  // The live catalogue, so the bag's prices and stock are reconciled here as
  // they are on /bag. A catalogue that cannot be read is not a reason to
  // refuse checkout: the API prices and reserves the order regardless.
  const products = await getStorefrontProducts().catch(() => null);

  // The shop's name and logo, for the payment sheet this page opens.
  return <CheckoutView products={products} shop={getShop()} />;
}
