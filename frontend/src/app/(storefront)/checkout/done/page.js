import { OrderConfirmation } from "@/components/store/OrderConfirmation";

export const metadata = {
  title: "Order placed",
  // A confirmation is personal and single-use. There is nothing here for a
  // crawler, and the page is empty for anyone who did not just check out.
  robots: { index: false, follow: false },
};

export default function CheckoutDonePage() {
  return <OrderConfirmation />;
}
