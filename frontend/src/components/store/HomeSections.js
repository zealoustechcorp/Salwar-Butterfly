import { BadgeCheck, PackageCheck, Repeat2, Ruler, ShieldCheck, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Butterfly, WhatsAppGlyph } from "./Ornaments";

/** Static, server-rendered sections. Nothing here needs client state. */

/**
 * The shop's own trust badges and headline numbers, spelling normalised
 * ("Watsapp" → "WhatsApp", "llakh" → "1 lakh"). The claims and their wording
 * are the shop's — nothing here is computed or invented.
 *
 * The source copy repeats itself — "99% best products, delivered safely" is
 * stated twice, once under "Genuine Products", and WhatsApp support appears
 * both with and without the number. Each pair is merged into one badge rather
 * than printed twice.
 */
const PROMISES = [
  {
    icon: Truck,
    title: "Fast delivery",
    detail: "5–10 working days to your door, free all over India.",
  },
  {
    icon: ShieldCheck,
    title: "Secure payment",
    detail: "GPay, PhonePe, Paytm and more — online payment only.",
  },
  {
    icon: BadgeCheck,
    title: "Genuine products",
    detail: "99% best products, delivered safely.",
  },
  {
    icon: PackageCheck,
    title: "WhatsApp support",
    detail: "Message us for any query, before or after the order.",
    // Filled in from the shop's own contact details below.
    contact: true,
  },
];

export function TrustBar({ shop }) {
  const stats = [
    {
      value: "50,000+",
      label: "Happy customers on Instagram",
      href: shop?.instagram,
    },
    { value: "1 lakh+", label: "Products posted & sold" },
  ];

  return (
    <section className="border-y border-sb-gold/30 bg-sb-surface/30">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-7 lg:px-8">
        <dl className="grid grid-cols-2 gap-4 sm:gap-8">
          {stats.map(({ value, label, href }) => {
            const body = (
              <>
                <dt className="font-display text-3xl leading-none font-semibold text-sb-heading tabular sm:text-4xl">
                  {value}
                </dt>
                <dd className="mt-1.5 text-xs leading-relaxed text-sb-text-muted sm:text-[13px]">
                  {label}
                </dd>
              </>
            );

            return href ? (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="group block rounded-xl transition-colors hover:text-sb-link"
              >
                {body}
              </a>
            ) : (
              <div key={label}>{body}</div>
            );
          })}
        </dl>

        <div className="mt-6 grid gap-x-6 gap-y-5 border-t border-sb-gold/30 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          {PROMISES.map(({ icon: Icon, title, detail, contact }) => (
            <div key={title} className="flex gap-3">
              {contact ? (
                <WhatsAppGlyph className="mt-0.5 size-5 shrink-0 text-sb-gold-text sm:size-6" />
              ) : (
                <Icon
                  className="mt-0.5 size-5 shrink-0 text-sb-gold-text sm:size-6"
                  aria-hidden="true"
                />
              )}
              <div>
                <p className="text-[13px] font-bold text-sb-text sm:text-sm">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-sb-text-muted">
                  {detail}
                  {contact && shop?.phone ? (
                    <>
                      {" "}
                      <a
                        href={shop.whatsapp}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-semibold whitespace-nowrap text-sb-link underline underline-offset-2 tabular"
                      >
                        {shop.phone}
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function StorySection({ catalogueSize, categoryCount, sizeRange }) {
  return (
    <section id="story" className="scroll-mt-40 bg-sb-surface/25 wide:scroll-mt-28">
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
            Salwar Butterfly began with a simple love for salwar sets that are beautiful,
            comfortable and easy to wear. A small dream became a single-seller dress shop, and a
            place to find an outfit that makes you feel confident and yourself.
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-sb-text sm:text-base">
            Every design is chosen to hold traditional beauty and modern style together, with
            everyday comfort in mind — dhabu cotton, azrak block print, Chanderi silk, south
            cotton — and bought in a short, limited run. Once a run is gone, it is gone, which is
            why the shelf stays small and the fabric stays good.
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-sb-text sm:text-base">
            A QC team checks every outfit before it is dispatched, and the shop stays reachable on
            WhatsApp before and after the sale. Every order here means something — thank you for
            being part of the journey.
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
 * Its returns policy is the more useful thing to put here anyway.
 *
 * These three cards are a summary of /returns, which is the binding version —
 * nothing here may promise more than that page does. It notably does not cover
 * a size the customer picked themselves, which an earlier version of this
 * section wrongly said was exchangeable.
 */
const POLICY = [
  {
    icon: PackageCheck,
    title: "Damaged or defective",
    detail:
      "Message us on WhatsApp within 48 hours of delivery with your order details, clear photos and an unedited unboxing video, and we will take it back.",
  },
  {
    icon: Repeat2,
    title: "Wrong piece or wrong size sent",
    detail:
      "If we dispatched the wrong thing, it is exchanged subject to availability and the return shipping is ours, not yours.",
  },
  {
    icon: Ruler,
    title: "Check before you order",
    detail:
      "Change of mind, colour preference and screen colour variation are not return reasons, and an order cannot be cancelled once placed. Every listing states its fabric and sizes — read it, or ask us first.",
  },
];

export function PolicySection() {
  return (
    <section
      id="policy"
      className="mx-auto max-w-7xl scroll-mt-40 px-4 py-9 sm:px-6 sm:py-11 lg:px-8 lg:py-13 wide:scroll-mt-28"
    >
      <div className="text-center">
        <p className="sb-eyebrow text-[10px] text-sb-gold-text">Before You Order</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
          Stress-free, both ways
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-sb-text-muted">
          Every outfit is checked before it leaves us — and here is exactly what a return does and
          does not cover.
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

      <p className="mt-5 text-center text-sm text-sb-text-muted">
        Returned pieces must be unused, unworn and still tagged.{" "}
        <Link href="/returns" className="font-semibold text-sb-link underline underline-offset-4">
          Read the full return &amp; refund policy
        </Link>
        .
      </p>
    </section>
  );
}
