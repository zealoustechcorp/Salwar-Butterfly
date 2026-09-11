"use client";

import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { GarmentArt } from "./GarmentArt";
import { MediaFrame } from "./MediaFrame";
import { Butterfly } from "./Ornaments";
import { Stars } from "./Stars";
import { useBrowse } from "./BrowseProvider";

const ROTATE_MS = 5000;
// A shorter drag reads as a tap on the banner, not a swipe.
const SWIPE_PX = 44;

/**
 * Opening statement. The imagery is the shop's own homepage banner set — no
 * stock photography and nothing generated.
 *
 * The banners arrive as a prop, read from the API by the page above. They used
 * to be a frozen array in lib/store/shop.js, which meant a festival banner
 * could only reach this fold through a developer; they are now a table with an
 * admin screen over it, seeded from exactly those five URLs. What a slide is
 * did not change with the move: a photograph and a place in the order, with
 * `alt=""` because the headline beside it is the text.
 *
 * The two columns split at `md`, not `lg`: at tablet widths a single column
 * left the right half of the fold empty and pushed the headline down the page.
 *
 * The rating line under the buttons (F-06.08) holds to the same rule as the
 * imagery above it: it is the shop's real score across its real reviews, and it
 * is absent entirely until there are some. No "★★★★★ 5.0 (0)", no rounded-up
 * placeholder — an invented rating in the first fold is the most conspicuous
 * possible place to put a claim the shop cannot support.
 */
export function Hero({ banners = [], topDiscount, rating }) {
  const { focusShop, setTab } = useBrowse();
  // Banners that failed to load. They drop out of the carousel entirely — a
  // sliding track would otherwise stop on a blank frame — and when every one is
  // down the illustrated lockup takes over. That fallback is also what a shop
  // with no banners at all gets, so an empty carousel needs no separate case.
  const [down, setDown] = useState(() => new Set());
  const slides = banners
    .map((banner) => banner?.image)
    .filter((src) => src && !down.has(src));
  const allDown = slides.length === 0;

  const markDown = useCallback((src) => {
    setDown((current) => new Set(current).add(src));
  }, []);

  const openShop = (tab) => {
    setTab(tab);
    focusShop();
  };

  return (
    <section id="top" className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(120%_90%_at_78%_18%,#ebcbc0_0%,#fdf7f1_58%)]"
      />
      <div
        aria-hidden="true"
        className="absolute -top-24 -right-20 size-[20rem] rounded-full border border-sb-gold/35 lg:size-[30rem]"
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-7 px-4 py-6 sm:px-6 sm:py-8 md:grid-cols-[1.05fr_1fr] md:gap-8 lg:px-8 lg:py-11">
        <div>
          <p className="sb-eyebrow flex items-center gap-2 text-[9px] text-sb-gold-text sm:text-[10px]">
            <Butterfly className="size-4 text-sb-maroon-deco sm:size-5" />
            Limited runs · new drops daily
          </p>

          {/* The shop's own tagline is the headline — it is the brand line, not
              a strapline to bury above one. */}
          <h1 className="mt-3 font-display text-[2.6rem] leading-[1.04] font-semibold text-sb-heading sm:text-6xl lg:text-7xl xl:text-8xl">
            Fashion
            <br />
            meets <em className="italic">comfort.</em>
          </h1>

          <p className="mt-4 max-w-md text-sm leading-relaxed text-sb-text sm:text-base">
            Salwar suits, co-ord sets and anarkalis in dhabu cotton, azrak block print and Chanderi
            silk — cut for everyday ease, finished in limited runs and shipped free across India.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => openShop("new")}
              className="inline-flex items-center gap-2 rounded-full bg-sb-btn-primary px-5 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose sm:px-7 sm:py-3.5"
            >
              Shop new arrivals
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
            {topDiscount > 0 ? (
              <button
                type="button"
                onClick={() => openShop("offers")}
                className="inline-flex items-center gap-2 rounded-full border border-sb-heading px-5 py-3 text-sm font-semibold text-sb-heading transition-colors hover:bg-sb-surface/60 sm:px-7 sm:py-3.5"
              >
                Up to {topDiscount}% off
              </button>
            ) : null}
          </div>

          {/* Below the buttons, not above the headline: it is a reason to
              trust the shop once the offer has landed, not the offer. */}
          {rating?.count ? (
            <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <Stars rating={rating.average} />

              <p className="text-sm text-sb-text">
                <span className="font-semibold text-sb-heading tabular">
                  {rating.average.toFixed(1)}
                </span>{" "}
                <span className="text-sb-text-muted">
                  from {rating.count} customer{rating.count === 1 ? "" : "s"}
                  {/* Named only when it means something. "across 1 piece"
                      beside a shop of 200 reads worse than saying nothing. */}
                  {rating.products > 1 ? ` across ${rating.products} pieces` : ""}
                </span>
              </p>
            </div>
          ) : null}
        </div>

        {/* The shop's own banner set as a carousel — with the illustrated
            lockup standing in when there is nothing to show, whether that is
            because the shop has published no banners or because none of the
            photographs would load. */}
        <div className="relative mx-auto w-full max-w-md md:max-w-none">
          {allDown ? (
            <div className="grid grid-cols-3 items-end gap-2.5 sm:gap-4">
              {[
                { shape: "coord", seed: 1, tall: false, label: "Coord set" },
                { shape: "anarkali", seed: 4, tall: true, label: "Anarkali salwar" },
                { shape: "straight", seed: 2, tall: false, label: "Straight cut salwar" },
              ].map((figure, index) => (
                <div
                  key={figure.label}
                  className={`overflow-hidden rounded-t-full rounded-b-2xl border border-sb-gold/45 shadow-lg shadow-sb-maroon-deco/10 sm:rounded-b-3xl ${
                    figure.tall ? "" : "sb-float"
                  }`}
                  style={figure.tall ? undefined : { animationDelay: `${index * 1.6}s` }}
                >
                  <div className={figure.tall ? "aspect-4/7" : "aspect-2/3"}>
                    <GarmentArt shape={figure.shape} seed={figure.seed} label={figure.label} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <BannerCarousel slides={slides} onFail={markDown} />
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The banner carousel: one sliding track, arrows, swipe and dots.
 *
 * It advances on its own but holds the moment a visitor engages — hover, focus
 * or a drag — so a slide never moves out from under someone reading it.
 * `prefers-reduced-motion` drops both the autoplay and the slide transition,
 * leaving the arrows and dots as the way through.
 */
function BannerCarousel({ slides, onFail }) {
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  const dragFrom = useRef(null);

  const count = slides.length;
  // A banner that errors out is dropped from `slides`, so the index can point
  // past the end for a render; clamp rather than snapping back to the first.
  const index = Math.min(active, count - 1);

  const go = useCallback(
    (delta) => {
      setActive((i) => (Math.min(i, count - 1) + delta + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (count < 2 || held) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = setInterval(() => setActive((i) => (Math.min(i, count - 1) + 1) % count), ROTATE_MS);
    return () => clearInterval(timer);
  }, [count, held]);

  const endDrag = (event) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from === null) return;
    const dx = event.clientX - from;
    if (Math.abs(dx) >= SWIPE_PX) go(dx < 0 ? 1 : -1);
  };

  const onKeyDown = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    go(event.key === "ArrowLeft" ? -1 : 1);
  };

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Shop banners"
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      {/* A fixed 16:9 at every width. The banner set is a mix of whatever
          the shop has had made — a wide flyer, a square post, a photo off
          a phone — and letting each slide bring its own shape would make
          the first fold of the home page change height as it rotates.
          What fills the frame is MediaFrame's problem; how big the frame
          is, is this line's. */}
      <div
        className="group relative aspect-16/9 touch-pan-y overflow-hidden rounded-3xl border border-sb-gold/45 shadow-xl shadow-sb-maroon-deco/15"
        onPointerDown={(event) => {
          dragFrom.current = event.clientX;
        }}
        onPointerUp={endDrag}
        onPointerCancel={() => {
          dragFrom.current = null;
        }}
      >
        <div
          className="flex h-full w-full transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translate3d(-${index * 100}%, 0, 0)` }}
        >
          {slides.map((src, i) => (
            <div
              key={src}
              className="h-full w-full shrink-0"
              aria-roledescription="slide"
              aria-label={`Banner ${i + 1} of ${count}`}
              aria-hidden={i !== index}
            >
              {/* `ratio="h-full w-full"` because the shape is the track's
                  to decide here, not the frame's — every slide is the
                  16:9 box above. A banner that is not 16:9 is fitted
                  inside it against a blurred copy of itself rather than
                  being cropped to the middle third. */}
              <MediaFrame
                src={src}
                alt=""
                ratio="h-full w-full"
                sizes="(min-width: 768px) 45vw, 92vw"
                priority={i === 0}
                onError={() => onFail(src)}
              />
            </div>
          ))}
        </div>

        {count > 1 ? (
          <>
            <CarouselArrow side="left" onClick={() => go(-1)} />
            <CarouselArrow side="right" onClick={() => go(1)} />
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div className="mt-3 flex justify-center gap-2">
          {slides.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show banner ${i + 1}`}
              aria-current={i === index}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-sb-heading" : "w-1.5 bg-sb-gold/60"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Arrows sit faint over the artwork until the banner is hovered or the button
 * itself is focused — visible enough to find on touch, quiet enough not to
 * compete with the photograph.
 */
function CarouselArrow({ side, onClick }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous banner" : "Next banner"}
      className={`absolute top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-sb-gold/45 bg-sb-bg/80 text-sb-heading opacity-70 shadow-md backdrop-blur-sm transition hover:bg-sb-bg focus-visible:opacity-100 group-hover:opacity-100 sm:size-10 ${
        side === "left" ? "left-3" : "right-3"
      }`}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}
