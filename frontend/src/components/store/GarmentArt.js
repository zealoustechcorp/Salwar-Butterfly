/**
 * Brand-toned garment illustration — the fallback whenever a photo is missing.
 *
 * As of the 2026-08-29 snapshot the shop's Cloudinary account is disabled
 * (`cloud_name ddvui6pi4 is disabled`), so every product photo, category cover
 * and banner 401s. Rather than show broken tiles, `Photo` falls back to this.
 *
 * It is drawn only in the brand palette — blush, dusty pink, rose gold,
 * burgundy — and never in a colour sampled from a product, because the
 * snapshot records no colourway. A stylised silhouette reads as artwork; a
 * plausible-looking photograph of a garment nobody sells would not.
 *
 * No hooks, so it renders inside server components.
 */

import { cn } from "@/lib/utils";

/**
 * Silhouette parameters per live category shape, in the 0–120 × 0–170 viewBox,
 * mirrored around x = 60.
 *
 *   hem     half-width of the hem — the flare
 *   hemY    where the garment ends
 *   sleeve  sleeve length below the shoulder
 *   split   two-piece look: a hem line plus a centre seam below it
 */
const SHAPES = {
  anarkali: { hem: 46, hemY: 152, sleeve: 30, split: false, waistLine: 0 },
  aline: { hem: 34, hemY: 148, sleeve: 32, split: false, waistLine: 0 },
  straight: { hem: 22, hemY: 146, sleeve: 34, split: false, waistLine: 0 },
  coord: { hem: 32, hemY: 150, sleeve: 30, split: true, waistLine: 96 },
  western: { hem: 24, hemY: 124, sleeve: 22, split: false, waistLine: 0 },
};

// Brand tones only — ornament colours from the palette doc, never a claim about
// what colour a given product is.
const TONES = [
  { cloth: "#d49a9b", trim: "#7a4527" }, // dusty pink
  { cloth: "#ebcbc0", trim: "#8a2e4b" }, // blush
  { cloth: "#bc8a69", trim: "#5d2826" }, // rose gold
  { cloth: "#8a2e4b", trim: "#bc8a69" }, // rose
  { cloth: "#64252e", trim: "#d49a9b" }, // burgundy
  { cloth: "#5d2826", trim: "#ebcbc0" }, // deep maroon
];

const SHOULDER_Y = 30;
const SHOULDER = 21;
const WAIST_Y = 68;
const WAIST = 15;

function silhouettePath({ hem, hemY }) {
  const drop = hemY - WAIST_Y;
  return [
    `M ${60 - SHOULDER} ${SHOULDER_Y}`,
    `C ${60 - SHOULDER - 2} ${SHOULDER_Y + 16}, ${60 - WAIST - 2} ${WAIST_Y - 16}, ${60 - WAIST} ${WAIST_Y}`,
    `C ${60 - WAIST - (hem - WAIST) * 0.4} ${WAIST_Y + drop * 0.45}, ${60 - hem} ${hemY - drop * 0.3}, ${60 - hem} ${hemY}`,
    `Q 60 ${hemY + 8} ${60 + hem} ${hemY}`,
    `C ${60 + hem} ${hemY - drop * 0.3}, ${60 + WAIST + (hem - WAIST) * 0.4} ${WAIST_Y + drop * 0.45}, ${60 + WAIST} ${WAIST_Y}`,
    `C ${60 + WAIST + 2} ${WAIST_Y - 16}, ${60 + SHOULDER + 2} ${SHOULDER_Y + 16}, ${60 + SHOULDER} ${SHOULDER_Y}`,
    `C ${60 + 12} ${SHOULDER_Y - 7}, ${60 - 12} ${SHOULDER_Y - 7}, ${60 - SHOULDER} ${SHOULDER_Y}`,
    "Z",
  ].join(" ");
}

function sleevePath(sleeve) {
  const x = 60 - SHOULDER;
  return [
    `M ${x + 2} ${SHOULDER_Y + 1}`,
    `C ${x - 9} ${SHOULDER_Y + 5}, ${x - 12} ${SHOULDER_Y + 16}, ${x - 10} ${SHOULDER_Y + sleeve}`,
    `L ${x + 2} ${SHOULDER_Y + sleeve - 4}`,
    `C ${x} ${SHOULDER_Y + 17}, ${x + 1} ${SHOULDER_Y + 7}, ${x + 5} ${SHOULDER_Y + 4}`,
    "Z",
  ].join(" ");
}

/** Block-print motifs, echoing the azrak and floral prints the shop stocks. */
function Motif({ kind, id, tint }) {
  const stroke = { fill: "none", stroke: tint, strokeWidth: 1.2, strokeLinecap: "round" };
  if (kind === 1)
    return (
      <pattern id={id} width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(14)">
        <path d="M11 4c4 0 6.5 3 6.5 6.5S14 17 11 17s-4-2.5-4-5 1.6-4 3.2-4 2.4.8 2.4 2.4" {...stroke} />
      </pattern>
    );
  if (kind === 2)
    return (
      <pattern id={id} width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect x="4" y="4" width="8" height="8" {...stroke} />
        <circle cx="8" cy="8" r="1.4" fill={tint} />
      </pattern>
    );
  if (kind === 3)
    return (
      <pattern id={id} width="13" height="13" patternUnits="userSpaceOnUse">
        <circle cx="6.5" cy="6.5" r="1.7" fill={tint} />
      </pattern>
    );
  return (
    <pattern id={id} width="19" height="19" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <path d="M9.5 4c2.4 1.6 2.4 6.4 0 8-2.4-1.6-2.4-6.4 0-8Z" fill={tint} opacity="0.8" />
      <circle cx="9.5" cy="14" r="1.1" fill={tint} />
    </pattern>
  );
}

export function GarmentArt({ shape = "straight", seed = 0, label, className }) {
  const spec = SHAPES[shape] || SHAPES.straight;
  const tone = TONES[Math.abs(seed) % TONES.length];
  const uid = `g-${shape}-${Math.abs(seed) % 997}`;
  const tint = "rgba(253,247,241,0.34)";
  const body = silhouettePath(spec);

  return (
    <svg
      viewBox="0 0 120 170"
      className={cn("h-full w-full", className)}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label ? `${label} — illustration, photo unavailable` : "Garment illustration"}
    >
      <defs>
        <linearGradient id={`${uid}-ground`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#fdf7f1" />
          <stop offset="100%" stopColor="#ebcbc0" />
        </linearGradient>
        <linearGradient id={`${uid}-cloth`} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor={tone.cloth} />
          <stop offset="100%" stopColor={tone.cloth} stopOpacity="0.74" />
        </linearGradient>
        <Motif kind={Math.abs(seed) % 4} id={`${uid}-motif`} tint={tint} />
        <clipPath id={`${uid}-clip`}>
          <path d={body} />
        </clipPath>
      </defs>

      <rect width="120" height="170" fill={`url(#${uid}-ground)`} />
      <circle cx="60" cy="72" r="52" fill="#bc8a69" opacity="0.16" />
      <circle cx="60" cy="72" r="52" fill="none" stroke="#bc8a69" strokeWidth="0.6" opacity="0.45" />

      <g fill={tone.cloth} opacity="0.92">
        <path d={sleevePath(spec.sleeve)} />
        <path d={sleevePath(spec.sleeve)} transform="translate(120,0) scale(-1,1)" />
      </g>

      <g clipPath={`url(#${uid}-clip)`}>
        <path d={body} fill={`url(#${uid}-cloth)`} />
        <rect width="120" height="170" fill={`url(#${uid}-motif)`} />
        <rect x="0" y={spec.hemY - 9} width="120" height="9" fill={tone.trim} opacity="0.7" />
        {spec.split ? (
          <>
            <rect x="0" y={spec.waistLine} width="120" height="1.6" fill={tone.trim} opacity="0.65" />
            <rect x="59.2" y={spec.waistLine} width="1.6" height="170" fill={tint} />
          </>
        ) : null}
      </g>

      <path
        d="M50 26q10 13 20 0"
        fill="none"
        stroke="#2b1413"
        strokeOpacity="0.45"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d={body} fill="none" stroke="#5d2826" strokeOpacity="0.35" strokeWidth="1" />
    </svg>
  );
}

/** Live category id → silhouette. */
export const CATEGORY_SHAPE = {
  5: "straight",
  1: "coord",
  3: "aline",
  2: "anarkali",
  4: "western",
};
