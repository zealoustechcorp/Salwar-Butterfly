import { Star } from "lucide-react";

import { shortDate } from "@/lib/format";
import { Stars } from "./Stars";

/**
 * What shoppers have said about a piece (F-06.08).
 *
 * A server component: it renders text and never changes after it is
 * painted, so it ships no JavaScript to do it.
 *
 * The section is omitted entirely when nothing has been published — not
 * rendered as an empty "no reviews yet" block. That is the same rule the
 * rest of this storefront follows: the detail page carries no
 * description, care label or colourway because the shop publishes none,
 * and a heading over an empty space is a promise the page cannot keep.
 * A piece with reviews grows the section; a piece without one reads as
 * though it was never meant to have it.
 *
 * The reviews themselves are the shop's own record of what customers
 * told it on WhatsApp and on the phone (F-11.06), published from the
 * admin panel. There is no form here, because there is no endpoint
 * behind one.
 */
export function ProductReviews({ rating, reviews }) {
  if (!rating?.count || !reviews?.length) return null;

  return (
    <section
      id="reviews"
      className="mx-auto max-w-7xl px-4 py-9 sm:px-6 sm:py-11 lg:px-8 lg:py-13"
      aria-labelledby="reviews-heading"
    >
      <p className="sb-eyebrow text-[10px] text-sb-gold-text">What Shoppers Say</p>
      <h2
        id="reviews-heading"
        className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl"
      >
        {rating.count === 1 ? "One review" : `${rating.count} reviews`}
      </h2>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-12">
        {/* ----------------------------------------------------------
            THE SCORE
        ---------------------------------------------------------- */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-end gap-3">
            <span className="font-display text-5xl font-semibold text-sb-heading tabular">
              {rating.average.toFixed(1)}
            </span>
            <div className="pb-1.5">
              <Stars rating={rating.average} />
              <p className="mt-1 text-xs text-sb-text-muted">out of 5</p>
            </div>
          </div>

          <div className="sb-rule mt-5 h-px w-full" aria-hidden="true" />

          <ul className="mt-4 space-y-1.5">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = rating.distribution?.[stars] ?? 0;

              // Against the total, not against the tallest bar. A
              // relative scale makes one 3-star review look like a
              // verdict when nine people gave five.
              const share = rating.count ? (count / rating.count) * 100 : 0;

              return (
                <li key={stars} className="flex items-center gap-2.5">
                  <span className="flex w-8 shrink-0 items-center gap-0.5 text-xs text-sb-text-muted tabular">
                    {stars}
                    <Star className="size-3 fill-sb-gold-text text-sb-gold-text" aria-hidden="true" />
                  </span>

                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sb-surface">
                    <div
                      className="h-full rounded-full bg-sb-gold-text"
                      style={{ width: `${share}%` }}
                    />
                  </div>

                  <span className="w-5 shrink-0 text-right text-xs text-sb-text-muted tabular">
                    {count}
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="mt-4 text-[11px] leading-relaxed text-sb-text-muted">
            Reviews are collected by the shop from customers who bought this
            piece, and published here.
          </p>
        </div>

        {/* ----------------------------------------------------------
            THE REVIEWS
        ---------------------------------------------------------- */}
        <ul className="space-y-5">
          {reviews.map((review) => (
            <li
              key={review.id}
              className="rounded-2xl border border-sb-gold/30 bg-sb-surface/30 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <div className="flex items-center gap-2.5">
                  <Stars rating={review.rating} />
                  <span className="text-sm font-semibold text-sb-heading">
                    {review.author}
                  </span>
                </div>

                <time
                  dateTime={review.created_at}
                  className="text-xs text-sb-text-muted"
                >
                  {shortDate(review.created_at)}
                </time>
              </div>

              {review.title ? (
                <p className="mt-2 font-display text-lg font-semibold text-sb-heading">
                  {review.title}
                </p>
              ) : null}

              {review.body ? (
                <p className="mt-1.5 text-sm leading-relaxed text-sb-text">
                  {review.body}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {/* The list is capped by the API. Said out loud rather than
          truncated silently, so a piece with more reviews than fit does
          not look like it has exactly this many. */}
      {reviews.length < rating.count ? (
        <p className="mt-5 text-xs text-sb-text-muted">
          Showing the {reviews.length} most recent of {rating.count}.
        </p>
      ) : null}
    </section>
  );
}
