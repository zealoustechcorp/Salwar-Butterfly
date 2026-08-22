"use client";

import { readableOn } from "@/lib/format";
import { cx } from "./ui";

/**
 * Placeholder garment imagery, drawn as inline SVG from the variant colour.
 *
 * Product photography lives in Cloudinary in production (product_images.image_url).
 * Until those assets exist, rendering a deterministic fabric swatch keeps the
 * admin screens honest — every tile shows the actual colour_hex on record and
 * nothing depends on a network request.
 */

const MOTIFS = ["booti", "paisley", "chevron", "dots"];

function Motif({ kind, id, tint }) {
  const common = { fill: "none", stroke: tint, strokeWidth: 1.1, strokeLinecap: "round" };
  if (kind === "paisley")
    return (
      <pattern id={id} width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(12)">
        <path d="M14 5c5 0 8 4 8 8s-4 8-8 8-5-3-5-6 2-5 4-5 3 1 3 3" {...common} />
      </pattern>
    );
  if (kind === "chevron")
    return (
      <pattern id={id} width="20" height="16" patternUnits="userSpaceOnUse">
        <path d="M0 12 10 4l10 8" {...common} />
      </pattern>
    );
  if (kind === "dots")
    return (
      <pattern id={id} width="16" height="16" patternUnits="userSpaceOnUse">
        <circle cx="8" cy="8" r="2" fill={tint} />
      </pattern>
    );
  return (
    <pattern id={id} width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <path d="M12 6c3 2 3 8 0 10-3-2-3-8 0-10Z" fill={tint} opacity="0.75" />
      <circle cx="12" cy="17" r="1.3" fill={tint} />
    </pattern>
  );
}

export function ProductThumb({
  hex = "#c21e56",
  seed = 0,
  label,
  size = 40,
  className,
  rounded = "rounded-md",
  ring = true,
}) {
  const uid = `thumb-${String(hex).replace("#", "")}-${seed}`;
  const motif = MOTIFS[Math.abs(seed) % MOTIFS.length];
  const ink = readableOn(hex);
  const tint = ink === "#ffffff" ? "rgba(255,255,255,0.42)" : "rgba(15,23,42,0.24)";

  return (
    <span
      className={cx(
        "relative block shrink-0 overflow-hidden",
        ring && "ring-1 ring-ink-900/10",
        rounded,
        className,
      )}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label || `Fabric swatch, ${hex}`}
      title={label}
    >
      <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={hex} stopOpacity="1" />
            <stop offset="100%" stopColor={hex} stopOpacity="0.72" />
          </linearGradient>
          <Motif kind={motif} id={`${uid}-motif`} tint={tint} />
          <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.14" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill={`url(#${uid}-bg)`} />
        <rect width="100" height="100" fill={`url(#${uid}-motif)`} />
        <rect width="100" height="100" fill={`url(#${uid}-sheen)`} />
      </svg>
    </span>
  );
}

/** Large gallery tile with the display order and role written on it. */
export function ImageTile({ image, variantLabel, size = 132, className, children }) {
  return (
    <figure
      className={cx(
        "group relative overflow-hidden rounded-lg bg-ink-100 ring-1 ring-ink-200",
        className,
      )}
      style={{ height: size }}
    >
      <ProductThumb
        hex={image.swatch_hex}
        seed={image.swatch_seed}
        size="100%"
        rounded="rounded-none"
        ring={false}
        label={image.alt_text}
      />
      <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-ink-900/80 to-transparent px-2 pb-1.5 pt-5 text-[10px] font-medium text-white">
        <span className="truncate">{variantLabel || "Gallery"}</span>
        <span className="shrink-0 opacity-70">#{image.display_order + 1}</span>
      </figcaption>
      {image.is_primary ? (
        <span className="absolute left-1.5 top-1.5 rounded bg-gold-700 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
          Primary
        </span>
      ) : null}
      {children}
    </figure>
  );
}

export function ColourSwatch({ hex, name, size = 14 }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden="true"
        className="inline-block shrink-0 rounded-full ring-1 ring-ink-900/15"
        style={{ width: size, height: size, background: hex }}
      />
      <span>{name}</span>
    </span>
  );
}
