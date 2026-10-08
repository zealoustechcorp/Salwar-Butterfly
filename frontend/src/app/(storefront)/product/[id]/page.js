import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PolicySection } from "@/components/store/HomeSections";
import { ProductCard } from "@/components/store/ProductCard";
import { ProductDetail } from "@/components/store/ProductDetail";
import { ProductReviews } from "@/components/store/ProductReviews";
import { money } from "@/lib/format";
import {
  getProductIds,
  getRelatedProducts,
  getShop,
  getStorefrontProduct,
} from "@/lib/store/catalogue";
import { getProductReviews } from "@/lib/store/reviews";

/**
 * A single piece (F-06 Product Browsing) — where a card on the home page, the
 * shop or the wishlist leads.
 *
 * Every piece is prerendered at build time, so opening a product is a static
 * document with no spinner, and each one revalidates on the same minute the
 * rest of the storefront does. An id that is not in the catalogue 404s rather
 * than rendering an empty frame.
 *
 * The build asks the API for the id list. If it cannot reach it, the build
 * still succeeds and every product page renders on first request instead —
 * `dynamicParams` is on by default, so an empty list here means "prerender
 * none of them", not "these are the only ones that exist". A backend that is
 * down should cost a cold first visit, not a failed deploy.
 */
export async function generateStaticParams() {
  try {
    return (await getProductIds()).map((id) => ({ id }));
  } catch (error) {
    console.warn(
      `[product] could not prerender product pages: ${error.message}`,
    );

    return [];
  }
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const product = await getStorefrontProduct(id);

  if (!product) return { title: "Piece not found" };

  const price = product.mrp
    ? `${money(product.price)} (was ${money(product.mrp)}, ${product.off}% off)`
    : money(product.price);

  return {
    title: product.name,
    description: [
      `${product.name} — ${product.fabric ? `${product.fabric}, ` : ""}${product.category_name.toLowerCase()} from Salwar Butterfly.`,
      `${price}.`,
      product.available_sizes.length
        ? `Sizes ${product.available_sizes.join(", ")} in stock.`
        : "This run has sold out.",
      "Free shipping all over India.",
    ].join(" "),
    openGraph: {
      title: product.name,
      type: "website",
      images: product.image ? [{ url: product.image }] : undefined,
    },
  };
}

export default async function ProductPage({ params }) {
  const { id } = await params;
  const product = await getStorefrontProduct(id);

  if (!product) notFound();

  // Fetched alongside the related pieces rather than after them: two
  // independent reads, and awaiting them in sequence would add a round
  // trip to a page that is prerendered anyway.
  const [related, reviews] = await Promise.all([
    getRelatedProducts(product),
    getProductReviews(product.id),
  ]);

  const shop = getShop();

  return (
    <>
      <Breadcrumb product={product} />

      <ProductDetail product={product} shop={shop} />

      {/* F-06.08. Renders nothing at all when the piece has no reviews,
          and nothing when the read failed — the page is about the
          garment, and a review section is not worth 500ing over. */}
      {reviews ? (
        <ProductReviews rating={reviews.rating} reviews={reviews.reviews} />
      ) : null}

      {related.length ? (
        <section className="mx-auto max-w-7xl px-4 py-9 sm:px-6 sm:py-11 lg:px-8 lg:py-13">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <div>
              <p className="sb-eyebrow text-[10px] text-sb-gold-text">Nearby On The Shelf</p>
              <h2 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl">
                More from {product.category_name.toLowerCase()}
              </h2>
            </div>
            <Link
              href={`/shop?category=${product.category_id}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-sb-link underline underline-offset-4 hover:text-sb-heading"
            >
              See the whole collection
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 lg:gap-x-6">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}

      <PolicySection />
    </>
  );
}

function Breadcrumb({ product }) {
  const trail = [
    { label: "Home", href: "/" },
    { label: "Shop", href: "/shop" },
    { label: product.category_name, href: `/shop?category=${product.category_id}` },
  ];

  return (
    <nav
      aria-label="Breadcrumb"
      className="mx-auto max-w-7xl px-4 pt-5 text-xs text-sb-text-muted sm:px-6 lg:px-8"
    >
      <ol className="sb-no-scrollbar flex items-center gap-1.5 overflow-x-auto whitespace-nowrap">
        {trail.map((crumb) => (
          <li key={crumb.href} className="flex items-center gap-1.5">
            <Link href={crumb.href} className="hover:text-sb-link hover:underline">
              {crumb.label}
            </Link>
            <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
          </li>
        ))}
        <li aria-current="page" className="font-semibold text-sb-text">
          {product.name}
        </li>
      </ol>
    </nav>
  );
}
