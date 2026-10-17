"use client";

import { Heart } from "lucide-react";
import Link from "next/link";

import { money } from "@/lib/format";
import { productPath } from "@/lib/store/links";
import { cn } from "@/lib/utils";
import { Photo } from "./Photo";
import { ShelfSlider } from "./ShelfSlider";
import { useStore } from "./StoreProvider";

/** One easing for every movement on the card, so they settle together. */
const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

/**
 * A hand-picked shelf drawn as plain product cards (F-06 home shelves, layout
 * "cards") — what the shop uses for Best sellers and everyday collections.
 *
 * The pieces and their order are the shop's, picked in Admin → Home →
 * Sections. The title and the line under it are the shop's too; nothing here
 * says "best seller" on its own, so the same layout serves any collection.
 *
 * Arrows and a counter page through the shelf, so every picked piece can be
 * browsed without leaving the home page.
 *
 * @param {object} props
 * @param {{title: string, subtitle: string|null, slug: string}} props.section
 * @param {Array<object>} props.products the shelf's pieces, already in order
 */
export function CardShelf({ section, products }) {
  if (!products.length) return null;

  const headingId = `shelf-${section.slug}`;

  return (
    <section aria-labelledby={headingId} className="bg-sb-surface/30 py-10 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ShelfSlider
          label={section.title}
          head={
            <div>
              <h2 id={headingId} className="font-display text-3xl font-bold text-sb-heading sm:text-4xl lg:text-5xl">
                {section.title}
              </h2>
              {section.subtitle ? (
                <p className="mt-1.5 max-w-xl text-sm text-sb-text-muted">{section.subtitle}</p>
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
  const { toggleWish, wishlist } = useStore();
  const wished = wishlist.includes(product.id);
  const href = productPath(product);

  return (
    <article
      className={cn(
        "group flex w-44 flex-col overflow-hidden rounded-xl bg-white ring-1 ring-sb-gold/20 transition-[transform,box-shadow] duration-500 sm:w-56",
        "[@media(hover:hover)]:hover:-translate-y-1 [@media(hover:hover)]:hover:shadow-[0_14px_28px_-16px_rgba(62,26,24,0.45)]",
        EASE,
      )}
    >
      <div className="relative aspect-3/4 overflow-hidden bg-sb-surface/50">
        <Photo
          src={product.image}
          hoverSrc={product.image2}
          alt={product.name}
          categoryName={product.category_name}
          seed={product.id}
          priority={priority}
          sizes="(min-width: 640px) 224px, 176px"
          className={cn("object-cover transition-transform duration-700 [@media(hover:hover)]:group-hover:scale-[1.04]", EASE)}
        />

        {/* The photo is a pointer convenience; the name below is the
            keyboard-reachable link to the same page. */}
        <Link href={href} aria-hidden="true" tabIndex={-1} className="absolute inset-0 z-0" />

        {product.off > 0 ? (
          <span className="absolute top-2.5 left-2.5 z-10 rounded bg-sb-heading px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-sb-bg uppercase">
            {product.off}% off
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => toggleWish(product)}
          aria-pressed={wished}
          aria-label={wished ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
          className="absolute top-2 right-2 z-10 grid size-8 place-items-center rounded-full bg-white/90 text-sb-heading transition-colors hover:bg-white"
        >
          <Heart className={cn("size-4", wished && "fill-sb-btn-rose text-sb-btn-rose")} aria-hidden="true" />
        </button>

        {!product.in_stock ? (
          <span className="absolute bottom-2.5 left-2.5 z-10 rounded-full bg-sb-footer/90 px-2.5 py-1 text-[10px] font-semibold text-sb-bg">
            Sold out
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="text-[13px] leading-snug font-semibold text-sb-text sm:text-sm">
          <Link href={href} className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-link">
            {product.name}
          </Link>
        </h3>
        {product.fabric ? <p className="text-[11px] text-sb-text-muted sm:text-xs">{product.fabric}</p> : null}
        <p className="text-sm font-extrabold text-sb-text tabular">
          {money(product.price)}
          {product.mrp ? (
            <span className="ml-1.5 text-xs font-normal text-sb-text-muted line-through">{money(product.mrp)}</span>
          ) : null}
        </p>

        {/* Pushed to the bottom so every card's button lines up, whatever the
            length of the name above it. */}
        <div className="mt-auto pt-2">
          <Link
            href={href}
            tabIndex={-1}
            aria-hidden="true"
            className="block rounded-md border-[1.5px] border-sb-heading py-2 text-center text-[13px] font-bold text-sb-heading transition-colors duration-300 hover:bg-sb-heading hover:text-sb-bg"
          >
            Shop now
          </Link>
        </div>
      </div>
    </article>
  );
}
