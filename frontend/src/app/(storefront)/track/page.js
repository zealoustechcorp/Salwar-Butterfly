import { TrackOrder } from "@/components/store/TrackOrder";

export const metadata = {
  title: "Track your order",
  description:
    "Find your Salwar Butterfly order with the order number and the email you placed it with. No account needed.",
};

export default function TrackPage() {
  return <TrackOrder />;
}
