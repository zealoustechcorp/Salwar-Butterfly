import { BagView } from "@/components/store/BagView";
import { getShop, getStorefrontProducts } from "@/lib/store/catalogue";

export const metadata = {
  title: "Your bag",
  description: "The Salwar Butterfly pieces in your bag, with free shipping all over India.",
};

export default async function BagPage() {
  return <BagView products={await getStorefrontProducts()} shop={getShop()} />;
}
