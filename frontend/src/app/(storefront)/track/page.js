import { TrackOrder } from "@/components/store/TrackOrder";
import { getShop } from "@/lib/store/catalogue";

export const metadata = {
  title: "Track your order",
  description:
    "Find your Salwar Butterfly order with the order number and the email you placed it with. No account needed.",
};

export default function TrackPage() {
  // The shop's name and logo, for the payment sheet an unpaid order can open.
  return <TrackOrder shop={getShop()} />;
}
