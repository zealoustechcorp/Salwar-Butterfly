import { Mail, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Butterfly, InstagramGlyph, WhatsAppGlyph } from "./Ornaments";

// Every href is absolute: the footer renders on the bag, wishlist and account
// routes too, where a bare "#shop" would have nothing to scroll to.
const SECTIONS = [
  {
    title: "Shop",
    links: [
      { label: "New arrivals", href: "/shop?tab=new" },
      { label: "All collections", href: "/#categories" },
      { label: "On offer", href: "/shop?tab=offers" },
      { label: "Almost gone", href: "/shop?tab=almost-gone" },
      { label: "Our story", href: "/#story" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Returns & refunds", href: "/returns" },
      { label: "Shipping & delivery", href: "/account#delivery" },
      // Points at the tracking page itself now that there is one — it works
      // for a guest, which /account does not.
      { label: "Track your order", href: "/track" },
      { label: "Your bag", href: "/bag" },
    ],
  },
];

const LEGAL_LINKS = [
  { label: "Privacy policy", href: "/privacy" },
  { label: "Return & refund policy", href: "/returns" },
];

export function StoreFooter({ shop }) {
  return (
    <footer className="bg-sb-footer text-sb-bg">
      {/* Below `lg` (phones and tablets) the footer is compact: stacked one
          per row, the five blocks ran well over a screen tall. The brand line
          drops its paragraph and shares a row with the social icons; Shop and
          Help sit side by side (with Reach us beside them from `sm`), and the
          contacts wrap into one band on a phone. Text and padding step down
          too. From `lg` it is the full four-column footer. */}
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 gap-y-4 px-4 py-4 sm:grid-cols-3 sm:gap-x-6 sm:px-6 sm:py-5 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr] lg:gap-6 lg:px-8 lg:py-9">
        <div className="col-span-full flex items-center justify-between gap-3 lg:col-span-1 lg:block">
          <div className="flex items-center gap-2.5 lg:gap-3">
            <Image
              src="/Salwar Butterfly.jpeg"
              alt="Salwar Butterfly"
              width={48}
              height={48}
              className="size-8 rounded-full ring-1 ring-sb-gold/50 lg:size-11"
            />
            <span>
              <span className="block font-display text-base font-semibold lg:text-xl">{shop.name}</span>
              <span className="sb-eyebrow block text-[8px] text-sb-pink-deco lg:text-[9px]">{shop.tagline}</span>
            </span>
          </div>
          <p className="mt-4 hidden max-w-xs text-sm leading-relaxed text-sb-bg/70 lg:block">
            A single-seller dress shop for salwar suits, co-ord sets and anarkalis — bought in short
            limited runs and shipped free across India.
          </p>

          <div className="flex shrink-0 items-center gap-2 lg:mt-4">
            <a
              href={shop.instagram}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Salwar Butterfly on Instagram"
              className="rounded-full border border-sb-bg/25 p-2 text-sb-pink-deco transition-colors hover:bg-sb-bg/10 lg:p-2.5"
            >
              <InstagramGlyph className="size-3.5 lg:size-4" />
            </a>
            <a
              href={shop.whatsapp}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Chat with Salwar Butterfly on WhatsApp"
              className="rounded-full border border-sb-bg/25 p-2 text-sb-pink-deco transition-colors hover:bg-sb-bg/10 lg:p-2.5"
            >
              <WhatsAppGlyph className="size-3.5 lg:size-4" />
            </a>
            <Butterfly
              className="ml-2 hidden size-8 text-sb-pink-deco/60 lg:block"
              strokeWidth={1.2}
              aria-hidden="true"
            />
          </div>
        </div>

        {SECTIONS.map((section) => (
          <nav key={section.title} aria-label={section.title}>
            <p className="sb-eyebrow text-[9px] text-sb-pink-deco lg:text-[10px]">{section.title}</p>
            <ul className="mt-1.5 space-y-1 lg:mt-2.5 lg:space-y-1.5">
              {section.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-xs text-sb-bg/75 transition-colors hover:text-sb-bg lg:text-sm"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div className="col-span-2 sm:col-span-1">
          <p className="sb-eyebrow text-[9px] text-sb-pink-deco lg:text-[10px]">Reach us</p>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sb-bg/75 sm:block sm:space-y-1 lg:mt-2.5 lg:space-y-2 lg:text-sm">
            <li className="flex gap-2">
              <WhatsAppGlyph className="mt-px size-3.5 shrink-0 text-sb-pink-deco lg:size-4" />
              <a href={shop.whatsapp} target="_blank" rel="noreferrer noopener" className="hover:text-sb-bg">
                WhatsApp us
              </a>
            </li>
            <li className="flex gap-2">
              <Phone className="mt-px size-3.5 shrink-0 text-sb-pink-deco lg:size-4" aria-hidden="true" />
              <a href={`tel:+91${shop.phone}`} className="hover:text-sb-bg tabular">
                +91 {shop.phone}
              </a>
            </li>
            <li className="flex gap-2">
              <Mail className="mt-px size-3.5 shrink-0 text-sb-pink-deco lg:size-4" aria-hidden="true" />
              <a href={`mailto:${shop.email}`} className="break-all hover:text-sb-bg">
                {shop.email}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-sb-bg/15">
        {/* The legal pages live down here rather than in a fifth column: the
            grid above is already four columns wide at lg, and a policy link is
            what a shopper looks for at the very bottom of the page anyway. */}
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 text-[11px] text-sb-bg/60 sm:px-6 lg:px-8 lg:py-3.5 lg:text-xs">
          <p>© 2026 {shop.name}. All rights reserved.</p>
          <nav aria-label="Policies" className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.label} href={link.href} className="transition-colors hover:text-sb-bg">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
