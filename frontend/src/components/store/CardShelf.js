"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { money } from "@/lib/format";
import { productPath } from "@/lib/store/links";
import { cn } from "@/lib/utils";
import { Butterfly } from "./Ornaments";
import { Photo } from "./Photo";
import { ShelfSlider } from "./ShelfSlider";

/** One easing for every movement on the card, so they settle together. */
const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

/**
 * A special section on the home page (F-06 home shelves): any hand-picked
 * shelf — Best sellers, a Diwali or Pongal sale, any collection. There is one
 * look for all of them; only the words and the pieces differ.
 *
 * The pieces and their order are the shop's, picked in Admin → Home →
 * Sections, and so are the title and the line under it; nothing here says
 * "best seller" on its own, so the same layout serves any collection.
 *
 * Its look is deliberately unlike Just landed's cream, drifting row: a deep
 * maroon band, the heading centred under a butterfly, and photographs set in
 * a thin gold frame that draws in on hover. Shoppers swipe, drag or scroll the
 * row sideways — there are no arrows or counters anywhere on the home page.
 *
 * @param {object} props
 * @param {{title: string, subtitle: string|null, slug: string}} props.section
 * @param {Array<object>} props.products the shelf's pieces, already in order
 */
export function CardShelf({ section, products }) {
  if (!products.length) return null;

  const headingId = `shelf-${section.slug}`;

  return (
    <section aria-labelledby={headingId} className="bg-sb-footer py-12 text-sb-bg sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ShelfSlider
          label={section.title}
          fade="var(--color-sb-footer)"
          // Centred when the pieces fit; once they overflow, `safe` keeps the
          // first card from being pushed off the start of the row.
          trackClassName="justify-[safe_center] gap-5 sm:gap-6"
          head={
            <div className="text-center">
              <Butterfly className="mx-auto size-7 text-sb-pink-deco" strokeWidth={1.2} aria-hidden="true" />
              <h2 id={headingId} className="mt-2 font-display text-3xl font-semibold text-sb-bg italic sm:text-4xl lg:text-5xl">
                {section.title}
              </h2>
              {section.subtitle ? (
                <p className="mx-auto mt-2 max-w-xl text-sm text-sb-bg/70">{section.subtitle}</p>
              ) : null}
            </div>
          }
        >
          {products.map((product, index) => (
            <ShelfCard key={product.id} product={product} priority={index < 2} />
          ))}
        </ShelfSlider>
      </div>
    </section>
  );
}

function ShelfCard({ product, priority }) {
  const href = productPath(product);

  return (
    <article className={cn("group w-44 pt-1 transition-transform duration-500 sm:w-56 [@media(hover:hover)]:hover:-translate-y-1.5", EASE)}>
      <div className="relative aspect-3/4 overflow-hidden rounded-sm bg-sb-maroon-deco">
        <Photo
          src={product.image}
          hoverSrc={product.image2}
          alt={product.name}
          categoryName={product.category_name}
          seed={product.id}
          priority={priority}
          sizes="(min-width: 640px) 224px, 176px"
          className={cn("object-cover transition-transform duration-700 [@media(hover:hover)]:group-hover:scale-[1.05]", EASE)}
        />

        {/* The gold frame, inset from the edge; it draws in a little on hover. */}
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-2.5 z-10 border border-sb-gold/70 transition-[inset,border-color] duration-500 [@media(hover:hover)]:group-hover:inset-4 [@media(hover:hover)]:group-hover:border-sb-gold",
            EASE,
          )}
        />

        {/* The photo is a pointer convenience; the name below is the
            keyboard-reachable link to the same page. */}
        <Link href={href} aria-hidden="true" tabIndex={-1} draggable={false} className="absolute inset-0 z-0" />

        {product.off > 0 ? (
          <span className="absolute top-4 left-4 z-20 bg-sb-gold px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-sb-footer uppercase">
            {product.off}% off
          </span>
        ) : null}

        {!product.in_stock ? (
          <span className="absolute bottom-4 left-4 z-20 bg-sb-bg px-2.5 py-1 text-[10px] font-bold text-sb-footer">
            Sold out
          </span>
        ) : null}
      </div>

      <div className="pt-3.5 text-center">
        {product.fabric ? (
          <p className="sb-eyebrow text-[9px] text-sb-gold">{product.fabric}</p>
        ) : null}
        <h3 className="mt-1 font-display text-lg leading-snug font-semibold text-sb-bg sm:text-xl">
          <Link href={href} draggable={false} className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-pink-deco">
            {product.name}
          </Link>
        </h3>
        <p className="mt-1 text-sm font-bold text-sb-bg tabular">
          {money(product.price)}
          {product.mrp ? (
            <span className="ml-1.5 text-xs font-normal text-sb-bg/55 line-through">{money(product.mrp)}</span>
          ) : null}
        </p>

        {/* "Shop now" as a text link whose underline draws out on hover. */}
        <Link
          href={href}
          tabIndex={-1}
          aria-hidden="true"
          draggable={false}
          className="relative mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold tracking-[0.14em] text-sb-pink-deco uppercase"
        >
          Shop now
          <ArrowRight className={cn("size-3.5 transition-transform duration-500 [@media(hover:hover)]:group-hover:translate-x-1", EASE)} aria-hidden="true" />
          <span
            aria-hidden="true"
            className={cn("absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-sb-pink-deco transition-transform duration-500 [@media(hover:hover)]:group-hover:scale-x-100", EASE)}
          />
        </Link>
      </div>
    </article>
  );
}
