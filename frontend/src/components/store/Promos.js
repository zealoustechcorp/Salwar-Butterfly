"use client";

import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Butterfly, InstagramGlyph, WhatsAppGlyph } from "./Ornaments";
import { useBrowse } from "./BrowseProvider";

/**
 * Dusty-pink band. Text on this fill must be sb-ink-on-pink — 7.34:1 AAA.
 *
 * The headline used to read "Up to {topDiscount}% off", which was true but
 * tied the shop's loudest line to one number that moves on its own: the day
 * the deepest cut is 5% it reads as an apology, and the day nothing is
 * discounted it reads "Up to 0% off". So the percentage is gone and the claim
 * is the one thing that is always true here — the runs are short. The count
 * underneath still carries the specifics, and it cannot overstate itself
 * because it is counted from the same rows the button opens on.
 *
 * Both lines answer to an empty offer list rather than asserting into it. A
 * banner that promises offers and opens on an empty grid is worse than one
 * that talks about the shelf instead, and a shop this size sells out of its
 * discounted runs often enough for that to be a real afternoon.
 */
export function OfferBanner({ offerCount }) {
  const { setTab, focusShop } = useBrowse();

  const hasOffers = offerCount > 0;

  return (
    <section className="px-4 sm:px-6 lg:px-8">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-sb-surface-pink px-5 py-9 sm:px-10 sm:py-11 lg:py-12">
        <Butterfly
          className="absolute -top-6 -right-4 size-28 text-sb-maroon-deco opacity-20 sm:size-40"
          strokeWidth={0.9}
        />
        <Butterfly
          className="absolute -bottom-8 left-4 hidden size-28 text-sb-maroon-deco opacity-15 sm:block"
          strokeWidth={1}
        />

        <div className="relative max-w-2xl">
          <p className="sb-eyebrow text-[10px] text-sb-ink-on-pink/80">Live prices · Limited runs</p>
          <h2 className="mt-2.5 font-display text-3xl leading-tight font-semibold text-sb-ink-on-pink sm:text-4xl lg:text-5xl">
            {hasOffers ? "Offers on now, while the run lasts" : "Short runs, while they last"}
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-sb-ink-on-pink/85">
            {hasOffers
              ? offerCount === 1
                ? "One piece is marked below its original price right now."
                : `${offerCount} pieces are marked below their original price right now.`
              : "Everything is at its full price today."}{" "}
            Every run is limited — when a size sells out it does not come back.
          </p>
          <button
            type="button"
            onClick={() => {
              setTab(hasOffers ? "offers" : "new");
              focusShop();
            }}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-sb-btn-primary px-6 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-footer sm:px-7 sm:py-3.5"
          >
            {hasOffers ? "See everything on offer" : "See the whole shop"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}

export function FabricStrip({ fabrics }) {
  // `chosen` is the shopper's picks, `fabrics` is what the shop stocks. The
  // picks are a list, not one value: the chips add up the same way the shop
  // page's sidebar checkboxes do, because they are the same state.
  const { fabrics: chosen, browseFabric } = useBrowse();

  return (
    <section className="mx-auto max-w-7xl px-4 pb-1 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-sb-gold/35 bg-sb-bg px-4 py-4 sm:px-5">
        <p className="sb-eyebrow shrink-0 text-[10px] text-sb-gold-text">Shop by fabric &amp; print</p>
        <div className="sb-no-scrollbar flex flex-1 gap-2 overflow-x-auto">
          {fabrics.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => browseFabric(item.name)}
              aria-pressed={chosen.includes(item.name)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                chosen.includes(item.name)
                  ? "border-sb-heading bg-sb-heading text-sb-bg"
                  : "border-sb-gold/45 text-sb-text hover:border-sb-heading hover:bg-sb-surface/50",
              )}
            >
              {item.name}
              <span className="ml-1.5 text-xs opacity-60 tabular">{item.count}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * The shop has no mailing list — it announces launches on Instagram and takes
 * questions on WhatsApp, so this points at the two channels that actually
 * exist rather than at a signup form with nothing behind it.
 */
export function FollowSection({ shop }) {
  return (
    <section className="px-4 pt-9 pb-10 sm:px-6 sm:pt-11 lg:px-8 lg:pt-13 lg:pb-14">
      <div className="mx-auto max-w-7xl rounded-3xl bg-sb-footer px-5 py-10 text-center sm:px-12 sm:py-12">
        <Butterfly className="mx-auto size-9 text-sb-pink-deco sm:size-10" strokeWidth={1.2} />
        <h2 className="mt-4 font-display text-3xl font-semibold text-sb-bg sm:text-4xl lg:text-5xl">
          New launches, daily
        </h2>
        <p className="mx-auto mt-2.5 max-w-lg text-sm leading-relaxed text-sb-bg/75">
          Follow along for every new drop and the offers that come with it — or just message the
          shop if you want help picking a size.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href={shop.instagram}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 rounded-full bg-sb-bg px-6 py-3 text-sm font-bold text-sb-heading transition-colors hover:bg-sb-surface"
          >
            <InstagramGlyph className="size-4" />
            @salwar_butterfly
          </a>
          <a
            href={shop.whatsapp}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 rounded-full border border-sb-bg/30 px-6 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-bg/10"
          >
            <WhatsAppGlyph className="size-4" />
            Chat on WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}
