import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { money } from "@/lib/format";
import { productPath } from "@/lib/store/links";
import { cn } from "@/lib/utils";
import { AutoMarquee } from "./AutoMarquee";
import { Photo } from "./Photo";

/** How many of the newest pieces the shelf carries. */
const LIMIT = 12;

/** One easing for every movement on the card, so they settle together. */
const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

/** Every card shares the leaf frame: two corners rounded, two square. */
const CARD = "w-44 sm:w-52";
const PHOTO = "aspect-4/5";
const SHAPE = "rounded-tl-[2.5rem] rounded-br-[2.5rem]";
// Requested at the hovered size, so the enlarged photo stays sharp.
const SIZES = "(min-width: 640px) 280px, 230px";

/**
 * The hovered card grows by getting wider, its height following from the
 * photo's shape, so the cards beside it move aside rather than being
 * covered. The row is held at a resting card's height with the cards hung
 * from its top, and clips only sideways, so a grown card reaches down into
 * the blank space before the next section while hovered — never up over the
 * heading — and nothing below the row moves. It grows into the section's
 * own bottom padding (the home page gap, .sb-section in globals.css: 28px on
 * a phone, 36px from `sm`), so it is held to what fits there: 20px and 30px
 * taller, about a tenth larger. Hover-capable devices only; a card reached with
 * the keyboard grows the same way.
 */
const GROW =
  "relative transition-[width] [@media(hover:hover)]:hover:z-10 focus-within:z-10 duration-500 [@media(hover:hover)]:hover:w-[12rem] sm:[@media(hover:hover)]:hover:w-[14.5rem] focus-within:w-[12rem] sm:focus-within:w-[14.5rem]";

/**
 * "Just landed" — the newest pieces, newest first (F-06 home shelves).
 *
 * Automatic: nothing for the shop to maintain. `products` arrives already
 * sorted newest first (see decorateAll in lib/store/catalogue.js); sold-out
 * pieces are left out, since a shelf of new arrivals nobody can buy reads as
 * an empty shop. No dates are printed — the order says which is newest.
 *
 * The row drifts on its own (see <AutoMarquee>). No arrows or counter: the
 * movement is the invitation, and a drag or swipe still works for anyone who
 * wants to go faster. Every card is the same leaf-shaped photograph, small
 * at rest; the one under the pointer grows by about a third and its
 * neighbours move aside for it.
 *
 * Hover, on devices that have it, is one slow movement: the photo eases in
 * and cross-fades to the second photo where the shop uploaded one, the
 * caption lifts, and an arrow slides in. Touch screens get none of it and
 * lose nothing, since everything the hover reveals is also on the card.
 */
export function JustLanded({ products }) {
  const pieces = products.filter((product) => product.in_stock).slice(0, LIMIT);

  if (!pieces.length) return null;

  return (
    <section aria-labelledby="just-landed" className="sb-section">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="sb-eyebrow text-[10px] text-sb-gold-text">Fresh on the rack</p>
        <h2 id="just-landed" className="mt-1.5 font-display text-3xl font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
          Just landed
        </h2>
      </div>

      {/* Full bleed: the row runs edge to edge so pieces drift in from off
          screen rather than appearing at a margin. Each copy of the row has
          trailing padding equal to the gap and no leading padding, so the
          gap where the loop joins is exactly the gap between any two cards.
 */}
      <div className="relative z-10 mt-6">
        <AutoMarquee
          label="Just landed"
          className="h-[13.75rem] items-start gap-6 pr-6 sm:h-[16.25rem]"
        >
          {pieces.map((product, index) => {
            return (
              <article key={product.id} data-marquee-item className={cn("shrink-0", CARD, GROW, EASE)}>
                <Link
                  href={productPath(product)}
                  className={cn(
                    "group relative block overflow-hidden bg-sb-surface/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sb-link",
                    SHAPE,
                  )}
                >
                  <div className={cn("relative w-full", PHOTO)}>
                    {/* Photo cross-fades to `hoverSrc` itself, and only once
                        that second photo has loaded — a failed one never
                        covers the first. The ease-in zoom runs underneath. */}
                    <Photo
                      src={product.image}
                      hoverSrc={product.image2}
                      alt={product.name}
                      categoryName={product.category_name}
                      seed={product.id}
                      priority={index < 2}
                      sizes={SIZES}
                      className={cn(
                        "object-cover transition-[transform,opacity] duration-700 [@media(hover:hover)]:group-hover:scale-[1.04]",
                        EASE,
                      )}
                    />
                  </div>

                  {index === 0 ? (
                    <span className="absolute top-3 left-3 z-10 rounded-full bg-sb-bg px-2.5 py-0.5 text-[9px] font-bold tracking-[0.12em] text-sb-heading uppercase">
                      Newest
                    </span>
                  ) : null}

                  {/* The caption, on a fade that keeps white text legible on
                      a pale photograph. */}
                  <div className="absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-sb-footer/90 via-sb-footer/45 to-transparent px-3.5 pt-12 pb-3.5">
                    <div className={cn("flex items-end justify-between gap-3 transition-transform duration-500 [@media(hover:hover)]:group-hover:-translate-y-1", EASE)}>
                      <div className="min-w-0">
                        <h3 className="font-display text-base leading-snug font-semibold text-sb-bg sm:text-lg">
                          {product.name}
                        </h3>
                        <p className="mt-0.5 text-xs font-bold text-sb-bg tabular sm:text-[13px]">
                          {money(product.price)}
                          {product.mrp ? (
                            <span className="ml-1.5 font-normal text-sb-bg/70 line-through">{money(product.mrp)}</span>
                          ) : null}
                        </p>
                      </div>

                      <span
                        aria-hidden="true"
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-full bg-sb-bg text-sb-heading transition-[transform,opacity] duration-500",
                          "[@media(hover:hover)]:translate-x-2 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:translate-x-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100",
                          EASE,
                        )}
                      >
                        <ArrowUpRight className="size-3.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              </article>
            );
          })}
        </AutoMarquee>
      </div>
    </section>
  );
}
