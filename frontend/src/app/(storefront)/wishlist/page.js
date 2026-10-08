import { WishlistView } from "@/components/store/WishlistView";
import { getStorefrontProducts } from "@/lib/store/catalogue";

export const metadata = {
  title: "Your wishlist",
  description: "The Salwar Butterfly pieces you have saved.",
};

export default async function WishlistPage() {
  return <WishlistView products={await getStorefrontProducts()} />;
}
