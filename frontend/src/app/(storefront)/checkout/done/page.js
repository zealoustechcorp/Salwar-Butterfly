import { OrderConfirmation } from "@/components/store/OrderConfirmation";
import { getShop } from "@/lib/store/catalogue";

export const metadata = {
  title: "Order placed",
  // A confirmation is personal and single-use. There is nothing here for a
  // crawler, and the page is empty for anyone who did not just check out.
  robots: { index: false, follow: false },
};

export default function CheckoutDonePage() {
  // The shop's name and logo, for the payment sheet this page can open.
  return <OrderConfirmation shop={getShop()} />;
}
