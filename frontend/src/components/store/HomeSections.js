import { PackageCheck, Repeat2, Ruler, ShieldCheck, Sparkles, Truck } from "lucide-react";
import Image from "next/image";

import { Butterfly } from "./Ornaments";

/** Static, server-rendered sections. Nothing here needs client state. */

// The four trust badges the shop configured for its own homepage, spelling
// normalised ("Watsapp" → "WhatsApp", "Gst" → "GST"). Wording and meaning are
// the shop's own — see live-catalogue.json → shop.features.
const PROMISES = [
  {
    icon: Truck,
    title: "Delivery in 10 working days",
    detail: "Free shipping all over India.",
  },
  {
    icon: ShieldCheck,
    title: "GST registered brand",
    detail: "A trusted seller, invoiced on every order.",
  },
  {
    icon: Sparkles,
    title: "Limited edition",
    detail: "Short runs — book fast before stock is out.",
  },
  {
    icon: PackageCheck,
    title: "WhatsApp support",
    detail: "Online payment only, no cash on delivery.",
  },
];

export function TrustBar() {
  return (
    <section className="border-y border-sb-gold/30 bg-sb-surface/30">
      <div className="mx-auto grid max-w-7xl gap-x-6 gap-y-5 px-4 py-6 sm:grid-cols-2 sm:px-6 sm:py-7 lg:grid-cols-4 lg:px-8">
        {PROMISES.map(({ icon: Icon, title, detail }) => (
          <div key={title} className="flex gap-3">
            <Icon className="mt-0.5 size-5 shrink-0 text-sb-gold-text sm:size-6" aria-hidden="true" />
            <div>
              <p className="text-[13px] font-bold text-sb-text sm:text-sm">{title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-sb-text-muted">{detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function StorySection({ catalogueSize, categoryCount, sizeRange }) {
  return (
    <section id="story" className="scroll-mt-24 bg-sb-surface/25">
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12 lg:px-8 lg:py-16">
        <div className="relative mx-auto w-full max-w-[15rem] sm:max-w-xs lg:max-w-sm">
          <div aria-hidden="true" className="absolute -inset-4 rounded-3xl border border-sb-gold/40" />
          <Image
            src="/Salwar Butterfly.jpeg"
            alt="The Salwar Butterfly shopfront mark"
            width={520}
            height={520}
            className="relative w-full rounded-2xl ring-1 ring-sb-gold/45"
          />
        </div>

        <div>
          <p className="sb-eyebrow flex items-center gap-2 text-[10px] text-sb-gold-text">
            <Butterfly className="size-5 text-sb-maroon-deco" />
            Our Story
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
            Fashion meets comfort,
            <br />
            one short run at a time
          </h2>
          <div className="sb-rule mt-4 h-px w-40" aria-hidden="true" />
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-sb-text sm:text-base">
            Salwar Butterfly is a single-seller dress shop. Every piece is bought in a short,
            limited run — dhabu cotton, azrak block print, Chanderi silk, south cotton — and once a
            run is gone, it is gone. That is why the shelf stays small and the fabric stays good.
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-sb-text sm:text-base">
            A QC team checks every outfit before it is dispatched, and the shop stays reachable on
            WhatsApp before and after the sale.
          </p>

          <dl className="mt-6 grid max-w-lg grid-cols-3 gap-4 border-t border-sb-gold/35 pt-4 sm:gap-6">
            {[
              { term: "Pieces in store", value: String(catalogueSize) },
              { term: "Collections", value: String(categoryCount) },
              { term: "Sizes", value: sizeRange || "36 – 46" },
            ].map((stat) => (
              <div key={stat.term}>
                <dt className="sb-eyebrow text-[9px] text-sb-gold-text">{stat.term}</dt>
                <dd className="mt-1 font-display text-2xl font-semibold text-sb-heading tabular sm:text-3xl">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

/**
 * The shop's actual returns position, in its own terms.
 *
 * This replaces a testimonials rail: the live shop publishes no review data,
 * and inventing customer quotes for a real business would be a lie on the page.
 * Its exchange policy is the more useful thing to put here anyway.
 */
const POLICY = [
  {
    icon: Ruler,
    title: "Exchange for size issues",
    detail:
      "If the fit is wrong, the piece can be exchanged. On the borderline between two sizes, order the larger one.",
  },
  {
    icon: Repeat2,
    title: "Exchange for damaged pieces",
    detail:
      "A QC team checks every outfit before dispatch, so damage is rare — if it happens, it is exchanged.",
  },
  {
    icon: PackageCheck,
    title: "Read the fabric first",
    detail:
      "Colour and material preference is not an exchange reason. Every listing states its fabric — please read it before ordering.",
  },
];

export function PolicySection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-9 sm:px-6 sm:py-11 lg:px-8 lg:py-13">
      <div className="text-center">
        <p className="sb-eyebrow text-[10px] text-sb-gold-text">Before You Order</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
          Stress-free, both ways
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-sb-text-muted">
          A customer-friendly policy, before and after the purchase — here is exactly what it does
          and does not cover.
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
        {POLICY.map(({ icon: Icon, title, detail }) => (
          <div
            key={title}
            className="rounded-2xl border border-sb-gold/35 bg-sb-bg p-5 sm:p-6"
          >
            <Icon className="size-6 text-sb-gold-text" aria-hidden="true" />
            <p className="mt-3 font-display text-xl font-semibold text-sb-heading">{title}</p>
            <p className="mt-2 text-sm leading-relaxed text-sb-text">{detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
