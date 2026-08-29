import { WishlistView } from "@/components/store/WishlistView";
import { getStorefrontProducts } from "@/lib/store/catalogue";

export const metadata = {
  title: "Your wishlist",
  description: "The Salwar Butterfly pieces you have saved on this device.",
};

export default function WishlistPage() {
  return <WishlistView products={getStorefrontProducts()} />;
}
