"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { money } from "@/lib/format";
import { productPath } from "@/lib/store/links";
import { cn } from "@/lib/utils";
import { Butterfly } from "./Ornaments";
import { Photo } from "./Photo";
import { ShelfSlider } from "./ShelfSlider";

/** One easing for every movement on the card, so they settle together. */
const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

/** How often one card on screen swaps places with one off it, in ms. */
const STEP = 3000;

/** How long a shopper's own scrolling holds the swapping still, in ms. */
const SCROLL_HOLD = 4000;

/** How long each half of a flip takes, in ms — matches `duration-300` below. */
const HALF_FLIP = 300;

/**
 * Card widths that put exactly two cards on a phone screen, three from `sm`
 * and five from `lg`, with the row's gap between them; the rest of the
 * section sits further along the row.
 */
const CARD_WIDTH =
  "w-[calc((100%-0.75rem)/2)] sm:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-4rem)/5)]";

/**
 * The home page's own section (F-06 home shelves) — the one the shop names
 * for whatever it needs: Best sellers, a Diwali sale, Pongal specials. The
 * pieces and their order are the shop's, picked in Admin → Home page →
 * Custom section.
 *
 * A deep maroon band, the heading centred under a butterfly, and one row of
 * every piece in the section, photographs set in a thin gold frame. The row
 * scrolls sideways — swipe, drag or trackpad — so a shopper can reach any
 * piece. It also changes by itself: every few seconds one card on screen
 * turns over and swaps places with a piece further along the row, so what
 * is in view refreshes while every piece stays in the row exactly once.
 *
 * A shopper pointing at a card freezes that card; scrolling holds all
 * swapping for a few seconds, so nothing moves under someone browsing. It
 * stands still while off screen or the tab is hidden, when every piece
 * already fits, and for anyone whose device asks for reduced motion. No
 * arrows or counters, as everywhere on the home page.
 *
 * @param {object} props
 * @param {{title: string, subtitle: string|null, slug: string}} props.section
 * @param {Array<object>} props.products the section's pieces, in the shop's order
 */
export function CardShelf({ section, products }) {
  const root = useRef(null);
  const frozen = useRef(new Set());
  const count = products.length;

  // Which piece each place on the row shows, by index into `products`.
  // Always a reordering of all of them: swaps move pieces, never drop one.
  const [order, setOrder] = useState(() => products.map((_, n) => n));

  useEffect(() => {
    if (count < 2) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const section = root.current;
    const track = section.querySelector("[data-slot]")?.parentElement;
    if (!track) return undefined;

    let visible = false;
    let heldUntil = 0;
    let turn = 0;
    const seen = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.25 });
    seen.observe(section);

    const hold = () => { heldUntil = Date.now() + SCROLL_HOLD; };
    track.addEventListener("scroll", hold, { passive: true });
    track.addEventListener("pointerdown", hold);

    const timer = setInterval(() => {
      if (!visible || document.hidden || Date.now() < heldUntil) return;

      // Which places are fully on screen right now, and which are not.
      const box = track.getBoundingClientRect();
      const places = [...track.querySelectorAll("[data-slot]")];
      const onScreen = [];
      const offScreen = [];
      places.forEach((place, at) => {
        const rect = place.getBoundingClientRect();
        const inside = rect.left >= box.left - 2 && rect.right <= box.right + 2;
        (inside ? onScreen : offScreen).push(at);
      });
      if (!offScreen.length) return;

      // Take turns across the cards in view, skipping a frozen one; swap with
      // the place furthest off screen that has waited longest.
      const ready = onScreen.filter((at) => !frozen.current.has(at));
      if (!ready.length) return;
      const a = ready[turn % ready.length];
      const b = offScreen[turn % offScreen.length];
      turn += 1;

      setOrder((current) => {
        const next = [...current];
        [next[a], next[b]] = [next[b], next[a]];
        return next;
      });
    }, STEP);

    return () => {
      clearInterval(timer);
      seen.disconnect();
      track.removeEventListener("scroll", hold);
      track.removeEventListener("pointerdown", hold);
    };
  }, [count]);

  if (!count) return null;

  const headingId = `shelf-${section.slug}`;

  return (
    <section ref={root} aria-labelledby={headingId} className="sb-band bg-sb-footer text-sb-bg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ShelfSlider
          label={section.title}
          fade="var(--color-sb-footer)"
          // Centred when every piece fits; once they overflow, `safe` keeps
          // the first card from being pushed off the start of the row.
          trackClassName="justify-[safe_center] gap-3 sm:gap-4"
          head={
            <div className="text-center">
              <Butterfly className="mx-auto size-7 text-sb-pink-deco" strokeWidth={1.2} aria-hidden="true" />
              <h2 id={headingId} className="mt-1 font-display text-3xl font-semibold text-sb-bg italic sm:text-4xl lg:text-5xl">
                {section.title}
              </h2>
              {section.subtitle ? (
                <p className="mx-auto mt-1 max-w-xl text-sm text-sb-bg/70">{section.subtitle}</p>
              ) : null}
            </div>
          }
        >
          {order.map((productIndex, at) => (
            <div
              key={at}
              data-slot
              onPointerEnter={() => frozen.current.add(at)}
              onPointerLeave={() => frozen.current.delete(at)}
              onFocus={() => frozen.current.add(at)}
              onBlur={() => frozen.current.delete(at)}
              className={cn(CARD_WIDTH, "[perspective:1000px]")}
            >
              <FlipSlot product={products[productIndex]} priority={at < 2} />
            </div>
          ))}
        </ShelfSlider>
      </div>
    </section>
  );
}

/**
 * One place on the row. Handed a different piece, it turns over: the old
 * card rotates away to edge-on, the new one is swapped in while unseen,
 * jumps to the other edge, and rotates the rest of the way to face the
 * shopper.
 */
function FlipSlot({ product, priority }) {
  const [shown, setShown] = useState(product);
  const [phase, setPhase] = useState("rest");
  // Which piece this slot is turning to. A ref, not `shown`, decides whether
  // a flip is needed: `shown` changes halfway through the flip, and an effect
  // that depended on it would re-run there and cancel its own last step —
  // leaving the new card stuck edge-on, which is to say invisible.
  const target = useRef(product.id);

  useEffect(() => {
    if (product.id === target.current) return undefined;
    target.current = product.id;

    // Everything runs from frames and timers, never synchronously in the
    // effect, so the turn starts on the next frame like any animation.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let swap = 0;
    let frame = requestAnimationFrame(() => {
      if (still) {
        setShown(product);
        return;
      }

      setPhase("out");
      swap = setTimeout(() => {
        setShown(product);
        setPhase("in");
        // Two frames: one to paint the new card edge-on at the far side
        // without a transition, the next to let it turn back to face front.
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => setPhase("rest"));
        });
      }, HALF_FLIP);
    });

    // Only reached when the slot is handed yet another piece mid-turn, or
    // unmounts; the next turn's own steps end it facing front again.
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(swap);
    };
  }, [product]);

  return (
    <div
      className={cn(
        "[transform-style:preserve-3d] motion-reduce:transition-none",
        phase === "out" && "transition-transform duration-300 ease-in [transform:rotateY(90deg)]",
        phase === "in" && "transition-none [transform:rotateY(-90deg)]",
        phase === "rest" && "transition-transform duration-300 ease-out [transform:rotateY(0deg)]",
      )}
    >
      {/* Keyed on the piece, so its photograph starts fresh (skeleton, then
          image) instead of inheriting the last piece's loaded or failed state. */}
      <ShelfCard key={shown.id} product={shown} priority={priority} />
    </div>
  );
}

function ShelfCard({ product, priority }) {
  const href = productPath(product);

  return (
    <article className={cn("group pt-1 transition-transform duration-500 [@media(hover:hover)]:hover:-translate-y-1.5", EASE)}>
      <div className="relative aspect-3/4 overflow-hidden rounded-sm bg-sb-maroon-deco">
        <Photo
          src={product.image}
          hoverSrc={product.image2}
          alt={product.name}
          categoryName={product.category_name}
          seed={product.id}
          priority={priority}
          sizes="(min-width: 1024px) 20vw, (min-width: 640px) 31vw, 47vw"
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

      <div className="pt-2.5 text-center">
        {product.fabric ? (
          <p className="sb-eyebrow text-[9px] text-sb-gold">{product.fabric}</p>
        ) : null}
        <h3 className="mt-0.5 font-display text-lg leading-snug font-semibold text-sb-bg sm:text-xl">
          <Link href={href} draggable={false} className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-pink-deco">
            {product.name}
          </Link>
        </h3>
        <p className="mt-0.5 text-sm font-bold text-sb-bg tabular">
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
          className="relative mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold tracking-[0.14em] text-sb-pink-deco uppercase"
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
