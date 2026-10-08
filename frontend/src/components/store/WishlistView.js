"use client";

import { Heart } from "lucide-react";
import Link from "next/link";

import { useAuth } from "./AuthProvider";
import { ProductCard } from "./ProductCard";
import { useStore } from "./StoreProvider";

/**
 * The saved pieces, resolved out of the live catalogue.
 *
 * The wishlist is only a list of product ids, so every card here is rendered
 * from the catalogue rather than from anything stored alongside the id —
 * prices and stock are whatever they are now, and a piece that has since sold
 * out says so instead of quietly showing what it cost when it was saved.
 *
 * Saving does not need an account. A guest's list lives on the device and is
 * folded into their account the moment they sign in, so nothing is lost by
 * hearting a piece first and deciding about an account later. Once there is an
 * account the list lives on the server and follows them between devices.
 */
export function WishlistView({ products }) {
  const { wishlist } = useStore();
  const { isSignedIn, openAuth } = useAuth();
  const saved = products.filter((product) => wishlist.includes(product.id));

  return (
    <section className="mx-auto max-w-7xl px-4 py-9 sm:px-6 sm:py-11 lg:px-8 lg:py-13">
      <p className="sb-eyebrow text-[10px] text-sb-gold-text">Saved For Later</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
        Your wishlist
      </h1>
      <p className="mt-2 text-sm text-sb-text-muted">
        {saved.length
          ? `${saved.length} ${saved.length === 1 ? "piece" : "pieces"} saved${isSignedIn ? "" : " on this device"}. Runs are short — a saved piece is not a reserved one.`
          : "Nothing saved yet."}
      </p>

      {!isSignedIn && saved.length ? (
        <p className="mt-4 rounded-2xl border border-sb-gold/35 bg-sb-surface/25 px-4 py-3 text-sm text-sb-text">
          Saved on this browser only.{" "}
          <button
            type="button"
            onClick={() =>
              openAuth({ reason: "Sign in and these saves come with you." })
            }
            className="font-semibold text-sb-link underline underline-offset-4 hover:text-sb-heading"
          >
            Sign in
          </button>{" "}
          to keep them on your account — the {saved.length === 1 ? "piece" : "pieces"} already
          here will come with you.
        </p>
      ) : null}

      {saved.length ? (
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-4 lg:gap-x-6">
          {saved.map((product, index) => (
            <ProductCard key={product.id} product={product} priority={index < 4} />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-sb-gold/50 bg-sb-surface/25 px-6 py-14 text-center">
          <Heart className="mx-auto size-8 text-sb-gold-text" aria-hidden="true" />
          <p className="mt-3 font-display text-2xl font-semibold text-sb-heading">
            No saved pieces yet
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-sb-text-muted">
            Tap the heart on any piece to keep it here while you decide.{" "}
            {isSignedIn
              ? "This list is on your account, so it follows you to any device you sign in on."
              : "You do not need an account — saves live on this browser until you sign in, and then they follow you."}
          </p>
          <Link
            href="/shop"
            className="mt-5 inline-flex rounded-full bg-sb-btn-primary px-7 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose"
          >
            Browse the shop
          </Link>
        </div>
      )}
    </section>
  );
}
