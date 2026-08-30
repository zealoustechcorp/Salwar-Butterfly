import { CheckoutView } from "@/components/store/CheckoutView";

export const metadata = {
  title: "Checkout",
  description:
    "Place your Salwar Butterfly order. Free shipping all over India, no account needed.",
  // An order form has nothing to offer a search engine, and the page only
  // exists for someone who already has a bag.
  robots: { index: false, follow: true },
};

export default function CheckoutPage() {
  return <CheckoutView />;
}
