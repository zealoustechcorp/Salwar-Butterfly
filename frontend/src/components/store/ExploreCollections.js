import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { ProductCard } from "./ProductCard";

/** The most pieces the section shows; the rest of the shop is one tap away. */
const LIMIT = 8;

/** Shown instead when the shop has featured nothing yet, so the section is never empty. */
const FALLBACK = 4;

/**
 * "Explore collections" on the home page (F-06).
 *
 * Not the whole shop: the pieces the shop has switched to Featured in the
 * admin (the product form's Featured switch), in stock, newest first — up
 * to eight — and one button through to the full shop at /shop, which has
 * the search, the tabs and the filters. Nothing here filters or searches.
 *
 * Until anything is featured it shows the newest few pieces instead, so the
 * section is never an empty heading.
 *
 * Cards are the shop's own product cards (size picker, Add to bag), laid
 * out in centred rows — two to a row on a phone, three from `sm`, four from
 * `lg` — so a short list sits in the middle rather than leaving gaps.
 */
export function ExploreCollections({ products }) {
  const inStock = products.filter((product) => product.in_stock);
  const featured = inStock.filter((product) => product.featured);
  const pieces = (featured.length ? featured : inStock).slice(0, featured.length ? LIMIT : FALLBACK);

  if (!pieces.length) return null;

  return (
    <section id="shop" aria-labelledby="explore-collections" className="sb-section mx-auto max-w-7xl scroll-mt-40 px-4 sm:px-6 lg:px-8 wide:scroll-mt-28">
      <div className="text-center">
        <p className="sb-eyebrow text-[10px] text-sb-gold-text">Explore</p>
        <h2 id="explore-collections" className="mt-1.5 font-display text-3xl font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
          Explore collections
        </h2>
        <p className="mx-auto mt-1.5 max-w-xl text-sm text-sb-text-muted">
          A few pieces the shop loves right now. There is more in the full shop.
        </p>
      </div>

      <ul className="mt-6 flex flex-wrap justify-center gap-x-3 gap-y-7 sm:gap-x-4 sm:gap-y-8">
        {pieces.map((product, index) => (
          <li
            key={product.id}
            className="w-[calc((100%-0.75rem)/2)] sm:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-3rem)/4)]"
          >
            <ProductCard product={product} priority={index < 2} />
          </li>
        ))}
      </ul>

      <div className="mt-8 flex justify-center">
        <Link
          href="/shop"
          className="group inline-flex items-center gap-2 rounded-full bg-sb-btn-primary px-7 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose"
        >
          Explore all collections
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
