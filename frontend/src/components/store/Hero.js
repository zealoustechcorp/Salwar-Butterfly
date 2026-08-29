"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

import { money } from "@/lib/format";
import { GarmentArt } from "./GarmentArt";
import { Butterfly } from "./Ornaments";
import { useBrowse } from "./BrowseProvider";

const ROTATE_MS = 5000;

/**
 * Opening statement. The imagery is the shop's own homepage banner set, pulled
 * from its settings — no stock photography and nothing generated.
 *
 * The two columns split at `md`, not `lg`: at tablet widths a single column
 * left the right half of the fold empty and pushed the headline down the page.
 */
export function Hero({ shop, catalogueSize, entryPrice, topDiscount }) {
  const { focusShop, setTab } = useBrowse();
  const slides = shop.banners || [];
  const [active, setActive] = useState(0);
  // Banners that failed to load. When every one is down the illustrated lockup
  // takes over rather than leaving an empty frame.
  const [down, setDown] = useState(() => new Set());
  const allDown = slides.length === 0 || down.size >= slides.length;

  useEffect(() => {
    if (slides.length < 2) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = setInterval(() => setActive((i) => (i + 1) % slides.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [slides.length]);

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
            silk — {catalogueSize} pieces in stock right now, from {money(entryPrice)}, shipped free
            across India.
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
        </div>

        {/* The shop's own banner set, cross-fading — with the illustrated
            lockup standing in while its Cloudinary account is disabled. */}
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
            <>
              <div className="relative aspect-4/5 overflow-hidden rounded-3xl border border-sb-gold/45 shadow-xl shadow-sb-maroon-deco/15 sm:aspect-square md:aspect-4/5">
                {slides.map((src, index) => (
                  <Image
                    key={src}
                    src={src}
                    alt=""
                    fill
                    priority={index === 0}
                    sizes="(min-width: 768px) 45vw, 92vw"
                    onError={() => setDown((current) => new Set(current).add(src))}
                    className={`object-cover transition-opacity duration-700 ${
                      index === active ? "opacity-100" : "opacity-0"
                    }`}
                  />
                ))}
              </div>

              {slides.length > 1 ? (
                <div className="mt-3 flex justify-center gap-2">
                  {slides.map((src, index) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setActive(index)}
                      aria-label={`Show banner ${index + 1}`}
                      aria-current={index === active}
                      className={`h-1.5 rounded-full transition-all ${
                        index === active ? "w-6 bg-sb-heading" : "w-1.5 bg-sb-gold/60"
                      }`}
                    />
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
