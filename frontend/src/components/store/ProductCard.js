"use client";

import { Heart, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Photo } from "./Photo";
import { Stars } from "./Stars";
import { useStore } from "./StoreProvider";

/**
 * A real product tile: the shop's own Cloudinary photography, its real price
 * and struck-through MRP, and only the sizes that still have stock.
 *
 * The star rating (F-06.08) appears only on pieces that actually have one.
 * This tile carried no rating at all until the shop had somewhere to publish
 * reviews from, on the principle that inventing one for a real business would
 * be a lie on the page — and that principle is what the `count` test below
 * still enforces. A piece nobody has reviewed shows nothing, not zero stars
 * and not an empty "(0)": those read as a verdict rather than as silence.
 *
 * The photo and the name open the piece's own page. They are two separate links
 * rather than one wrapper, because the tile also carries the wishlist button
 * and the size picker — controls cannot be nested inside an anchor, and the
 * overlay link is layered under them so a tap on a size never navigates.
 */
export function ProductCard({ product, priority = false }) {
  const { addToBag, toggleWish, wishlist } = useStore();
  // No size is pre-selected: the shopper has to pick one, so nothing lands in
  // the bag in a size they never chose.
  const [size, setSize] = useState(null);
  const wished = wishlist.includes(product.id);
  const needsSize = product.available_sizes.length > 0;
  const canAdd = product.in_stock && (!needsSize || Boolean(size));

  return (
    <article className="group flex flex-col">
      <div className="relative overflow-hidden rounded-2xl border border-sb-gold/30 bg-sb-surface/40">
        <div className="relative">
          <div className="relative aspect-3/4 w-full overflow-hidden bg-sb-surface/50">
            <Photo
              src={product.image}
              hoverSrc={product.image2}
              alt={product.name}
              categoryName={product.category_name}
              seed={product.id}
              priority={priority}
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              className={cn(
                "object-cover transition-all duration-500",
                // A second photo, where the shop uploaded one, becomes the
                // hover state instead of a scale-up.
                product.image2 ? "group-hover:opacity-0" : "group-hover:scale-105",
              )}
            />
          </div>

          {/* Covers the photo only, and sits under every control on the tile. */}
          <Link
            href={`/product/${product.id}`}
            aria-hidden="true"
            // The product name below is the keyboard-reachable link to the same
            // page, so this one is a pointer convenience and not a second tab stop.
            tabIndex={-1}
            className="absolute inset-0 z-0"
          />

          <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2.5 sm:p-3">
            {product.off > 0 ? (
              <span className="rounded-full bg-sb-btn-rose px-2 py-0.5 text-[10px] font-bold text-sb-bg sm:px-2.5 sm:py-1 sm:text-[11px]">
                {product.off}% off
              </span>
            ) : (
              <span />
            )}

            <button
              type="button"
              onClick={() => toggleWish(product)}
              aria-pressed={wished}
              aria-label={
                wished ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`
              }
              className="rounded-full bg-sb-bg/90 p-1.5 text-sb-heading shadow-sm transition-colors hover:bg-sb-bg sm:p-2"
            >
              <Heart
                className={cn("size-4", wished && "fill-sb-btn-rose text-sb-btn-rose")}
                aria-hidden="true"
              />
            </button>
          </div>

          {!product.in_stock ? (
            <span className="absolute bottom-2.5 left-2.5 rounded-full bg-sb-footer/90 px-2.5 py-1 text-[10px] font-semibold text-sb-bg sm:bottom-3 sm:left-3 sm:text-[11px]">
              Sold out
            </span>
          ) : product.is_low_stock ? (
            <span className="absolute bottom-2.5 left-2.5 rounded-full bg-sb-surface-pink px-2.5 py-1 text-[10px] font-semibold text-sb-ink-on-pink sm:bottom-3 sm:left-3 sm:text-[11px]">
              Only {product.stock} left
            </span>
          ) : null}
        </div>

        {/*
          On a pointer device this is an overlay that slides up on hover or
          keyboard focus; on touch there is no hover to wait for, so it sits in
          normal flow and is always tappable. `@media (hover: hover)` is the
          honest test — a 1024px tablet has a desktop's width and no pointer.
        */}
        <div className="border-t border-sb-gold/30 bg-sb-bg/95 p-3 transition-transform duration-300 group-hover:translate-y-0 group-focus-within:translate-y-0 [@media(hover:hover)]:absolute [@media(hover:hover)]:inset-x-0 [@media(hover:hover)]:bottom-0 [@media(hover:hover)]:translate-y-full">
          {product.available_sizes.length ? (
            <div className="mb-2 flex flex-wrap gap-1">
              {product.available_sizes.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSize(value)}
                  aria-pressed={size === value}
                  className={cn(
                    "min-w-7 rounded-md border px-1.5 py-1 text-[11px] font-semibold transition-colors sm:min-w-8",
                    size === value
                      ? "border-sb-heading bg-sb-heading text-sb-bg"
                      : "border-sb-gold/45 bg-sb-bg text-sb-text hover:border-sb-heading",
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          ) : (
            <p className="mb-2 text-[11px] text-sb-text-muted">No sizes in stock</p>
          )}

          <button
            type="button"
            disabled={!canAdd}
            onClick={() => addToBag(product, { size })}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-sb-btn-primary px-3 py-2.5 text-[13px] font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose disabled:cursor-not-allowed disabled:bg-sb-text-muted/40 sm:px-4 sm:text-sm"
          >
            <ShoppingBag className="size-4 shrink-0" aria-hidden="true" />
            {!product.in_stock ? "Sold out" : canAdd ? "Add to bag" : "Select a size"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col pt-3">
        <p className="sb-eyebrow text-[9px] text-sb-gold-text">{product.category_name}</p>
        <h3 className="mt-1 font-display text-lg leading-snug font-semibold text-sb-heading sm:text-xl">
          <Link
            href={`/product/${product.id}`}
            className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-link"
          >
            {product.name}
          </Link>
        </h3>

        {product.fabric ? (
          <p className="mt-0.5 text-[11px] text-sb-text-muted sm:text-xs">{product.fabric}</p>
        ) : null}

        {product.rating?.count ? (
          <div className="mt-1 flex items-center gap-1.5">
            <Stars rating={product.rating.average} />
            <span className="text-[11px] text-sb-text-muted tabular">
              {product.rating.average.toFixed(1)} ({product.rating.count})
            </span>
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-base font-bold text-sb-text tabular sm:text-lg">
            {money(product.price)}
          </span>
          {product.mrp ? (
            <>
              <span className="text-[13px] text-sb-text-muted line-through tabular sm:text-sm">
                {money(product.mrp)}
              </span>
              <span className="hidden text-xs font-semibold text-sb-link tabular sm:inline">
                Save {money(product.saving)}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
