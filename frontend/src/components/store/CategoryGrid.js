import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { money } from "@/lib/format";
import { Photo } from "./Photo";

/**
 * The live shop's five categories, on its own category photography.
 *
 * Every category opens `/shop?category=<id>` (read back by <ShopFilterSync>)
 * rather than filtering the home page's shop section and scrolling to it: the
 * shop page has the filter rail and a full grid, which the home section does
 * not, and a link survives a reload or being shared.
 */
export function CategoryGrid({ categories }) {
  return (
    <section
      id="categories"
      className="mx-auto max-w-7xl scroll-mt-40 px-4 py-9 sm:px-6 sm:py-11 lg:px-8 lg:py-13 wide:scroll-mt-28"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="sb-eyebrow text-[10px] text-sb-gold-text">Shop by Category</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
            Find your silhouette
          </h2>
        </div>
        <Link
          href="/shop"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-sb-link underline underline-offset-4 hover:text-sb-heading"
        >
          Browse everything
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/shop?category=${encodeURIComponent(category.id)}`}
            className="group relative block overflow-hidden rounded-2xl border border-sb-gold/35 bg-sb-surface/30 text-left transition-shadow hover:shadow-lg hover:shadow-sb-maroon-deco/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-link"
          >
            <div className="relative aspect-4/5 w-full overflow-hidden">
              <Photo
                src={category.image}
                alt={category.name}
                categoryName={category.name}
                seed={category.id * 2}
                sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>

            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-sb-footer/92 via-sb-footer/70 to-transparent p-3 pt-10 sm:p-4 sm:pt-12">
              <p className="font-display text-base leading-tight font-semibold text-sb-bg sm:text-lg">
                {category.name}
              </p>
              <p className="mt-1 line-clamp-2 hidden text-[11px] leading-snug text-sb-bg/75 lg:block">
                {category.blurb}
              </p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[10px] font-semibold text-sb-bg tabular sm:mt-2 sm:text-[11px]">
                {category.count} pieces
                <span className="text-sb-bg/60">· from {money(category.from_price)}</span>
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
