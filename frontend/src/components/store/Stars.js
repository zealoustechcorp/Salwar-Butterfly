import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Five stars, filled to the nearest fraction (F-06.08).
 *
 * Its own module because it is used from both sides of the client
 * boundary — <ProductReviews> is a server component, <ProductCard> is a
 * client one. Living in ProductReviews.js would drag that whole section
 * into the client bundle every time a grid of cards rendered.
 *
 * No directive of its own: it is a pure function of its props, so it
 * compiles as whichever kind of component the importer is.
 *
 * A partial star is drawn by clipping a filled one rather than by
 * loading a second icon, so the shape always matches the outline
 * underneath it exactly.
 */
export function Stars({ rating, className, size = "size-4" }) {
  const value = Number(rating) || 0;

  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={`${value.toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        // How much of this star is earned: 1 for a full one, 0 for an
        // empty one, and the remainder for the one the average lands in.
        const fill = Math.max(0, Math.min(1, value - star + 1));

        return (
          <span key={star} className="relative inline-block">
            <Star className={cn(size, "text-sb-gold/60")} aria-hidden="true" />

            {fill > 0 ? (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
                aria-hidden="true"
              >
                <Star className={cn(size, "fill-sb-gold-text text-sb-gold-text")} />
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
