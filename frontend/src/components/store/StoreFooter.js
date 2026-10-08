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
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr] lg:px-8 lg:py-9">
        <div className="sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-3">
            <Image
              src="/Salwar Butterfly.jpeg"
              alt="Salwar Butterfly"
              width={48}
              height={48}
              className="size-11 rounded-full ring-1 ring-sb-gold/50"
            />
            <span>
              <span className="block font-display text-xl font-semibold">{shop.name}</span>
              <span className="sb-eyebrow block text-[9px] text-sb-pink-deco">{shop.tagline}</span>
            </span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-sb-bg/70">
            A single-seller dress shop for salwar suits, co-ord sets and anarkalis — bought in short
            limited runs and shipped free across India.
          </p>

          <div className="mt-4 flex items-center gap-2">
            <a
              href={shop.instagram}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Salwar Butterfly on Instagram"
              className="rounded-full border border-sb-bg/25 p-2.5 text-sb-pink-deco transition-colors hover:bg-sb-bg/10"
            >
              <InstagramGlyph className="size-4" />
            </a>
            <a
              href={shop.whatsapp}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Chat with Salwar Butterfly on WhatsApp"
              className="rounded-full border border-sb-bg/25 p-2.5 text-sb-pink-deco transition-colors hover:bg-sb-bg/10"
            >
              <WhatsAppGlyph className="size-4" />
            </a>
            <Butterfly
              className="ml-2 size-8 text-sb-pink-deco/60"
              strokeWidth={1.2}
              aria-hidden="true"
            />
          </div>
        </div>

        {SECTIONS.map((section) => (
          <nav key={section.title} aria-label={section.title}>
            <p className="sb-eyebrow text-[10px] text-sb-pink-deco">{section.title}</p>
            <ul className="mt-2.5 space-y-1.5">
              {section.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-sb-bg/75 transition-colors hover:text-sb-bg"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div>
          <p className="sb-eyebrow text-[10px] text-sb-pink-deco">Reach us</p>
          <ul className="mt-2.5 space-y-2 text-sm text-sb-bg/75">
            <li className="flex gap-2.5">
              <WhatsAppGlyph className="mt-0.5 size-4 shrink-0 text-sb-pink-deco" />
              <a href={shop.whatsapp} target="_blank" rel="noreferrer noopener" className="hover:text-sb-bg">
                WhatsApp us
              </a>
            </li>
            <li className="flex gap-2.5">
              <Phone className="mt-0.5 size-4 shrink-0 text-sb-pink-deco" aria-hidden="true" />
              <a href={`tel:+91${shop.phone}`} className="hover:text-sb-bg tabular">
                +91 {shop.phone}
              </a>
            </li>
            <li className="flex gap-2.5">
              <Mail className="mt-0.5 size-4 shrink-0 text-sb-pink-deco" aria-hidden="true" />
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
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3.5 text-xs text-sb-bg/60 sm:px-6 lg:px-8">
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
