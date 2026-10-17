"use client";

import { cn } from "@/lib/utils";
import { Butterfly, InstagramGlyph, WhatsAppGlyph } from "./Ornaments";
import { useBrowse } from "./BrowseProvider";

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
