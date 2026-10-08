"use client";

import { Heart, ShoppingBag } from "lucide-react";
import Link from "next/link";

import { money } from "@/lib/format";
import { useStore } from "./StoreProvider";

/**
 * What this browser is actually holding.
 *
 * With no sign-in behind the storefront yet, the bag and the wishlist are the
 * only things the site genuinely knows about you — so the account page shows
 * those rather than an order history it cannot fetch.
 */
export function AccountSnapshot() {
  const { bagCount, bagTotal, wishCount } = useStore();

  const cards = [
    {
      href: "/bag",
      icon: ShoppingBag,
      label: "Your bag",
      value: bagCount ? `${bagCount} ${bagCount === 1 ? "piece" : "pieces"}` : "Empty",
      detail: bagCount ? `${money(bagTotal)} · free shipping` : "Nothing added yet",
    },
    {
      href: "/wishlist",
      icon: Heart,
      label: "Your wishlist",
      value: wishCount ? `${wishCount} saved` : "Empty",
      detail: wishCount ? "Saved, not reserved" : "Tap a heart to save a piece",
    },
  ];

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      {cards.map(({ href, icon: Icon, label, value, detail }) => (
        <Link
          key={href}
          href={href}
          className="rounded-2xl border border-sb-gold/35 bg-sb-bg p-5 transition-colors hover:border-sb-heading hover:bg-sb-surface/25"
        >
          <Icon className="size-5 text-sb-gold-text" aria-hidden="true" />
          <p className="sb-eyebrow mt-3 text-[10px] text-sb-gold-text">{label}</p>
          <p className="mt-1 font-display text-2xl font-semibold text-sb-heading">{value}</p>
          <p className="mt-1 text-xs text-sb-text-muted">{detail}</p>
        </Link>
      ))}
    </div>
  );
}
