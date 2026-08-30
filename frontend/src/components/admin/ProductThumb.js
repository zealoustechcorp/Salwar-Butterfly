"use client";

import { useState } from "react";

import { readableOn } from "@/lib/format";
import { cx } from "./ui";

/**
 * The fallback garment imagery, drawn as inline SVG.
 *
 * Products carry real photographs now (`product_images`, uploaded on the
 * edit screen's Photos tab), and `ProductCover` below shows them. This
 * swatch is what a product without one falls back to: rather than a grey
 * box, every tile draws a fabric pattern derived from the product's own
 * id, so an unphotographed product still looks the same on every screen
 * and needs no network request.
 */

const MOTIFS = ["booti", "paisley", "chevron", "dots"];

/** The brand-adjacent palette the swatches are drawn from. */
const PALETTE = [
  "#c21e56",
  "#7c3aed",
  "#0f766e",
  "#b45309",
  "#1d4ed8",
  "#be123c",
  "#4d7c0f",
  "#a21caf",
];

/** Stable small integer for any string — same input, same swatch. */
function hash(value) {
  let out = 0;
  const text = String(value ?? "");
  for (let i = 0; i < text.length; i++) {
    out = (out * 31 + text.charCodeAt(i)) >>> 0;
  }
  return out;
}

/**
 * The swatch for a product, as props for `ProductThumb`.
 *
 * @param {{id?: string, slug?: string}|string} product
 */
export function swatchFor(product) {
  const key =
    typeof product === "string" ? product : (product?.id ?? product?.slug ?? "");
  const seed = hash(key);
  return { hex: PALETTE[seed % PALETTE.length], seed };
}

/**
 * A product's cover photograph, falling back to its swatch.
 *
 * Every product screen shows a thumbnail, and a product may or may not
 * have been photographed yet — putting the choice here means no screen
 * has to decide, and an image that 404s degrades to the swatch instead
 * of a broken-image icon.
 *
 * @param {object} props
 * @param {{id?: string, name?: string, primaryImage?: {url: string, altText: string}}} props.product
 */
export function ProductCover({
  product,
  size = 40,
  className,
  rounded = "rounded-md",
  ring = true,
}) {
  const [failed, setFailed] = useState(false);
  const cover = product?.primaryImage;

  if (cover?.url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={cover.url}
        alt={cover.altText || product?.name || "Product photograph"}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cx(
          "block shrink-0 object-cover",
          ring && "ring-1 ring-ink-900/10",
          rounded,
          className,
        )}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <ProductThumb
      {...swatchFor(product)}
      size={size}
      className={className}
      rounded={rounded}
      ring={ring}
      label={product?.name}
    />
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
      aria-label={label || "Fabric swatch"}
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
