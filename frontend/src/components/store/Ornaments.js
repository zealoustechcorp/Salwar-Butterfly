/**
 * Brand ornaments. No hooks, so these render inside server components.
 *
 * The butterfly is the logo mark reduced to an outline — decoration only, in
 * `sb-maroon-deco`, never carrying text (Docs/Design_Brand-Palette-and-Typography.md §3).
 */

export function Butterfly({ className, stroke = "currentColor", strokeWidth = 1.4, ...props }) {
  return (
    <svg viewBox="0 0 48 40" className={className} fill="none" aria-hidden="true" {...props}>
      <g stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 9v23" />
        <path d="M24 11c-2.5-5-7-8.5-11.5-8.5C7.5 2.5 4 6 4 11c0 5.5 5 9 10 10-4 1.5-7 4.5-7 8.5 0 3.5 2.5 6 6 6 4.5 0 9-4.5 11-11" />
        <path d="M24 11c2.5-5 7-8.5 11.5-8.5C40.5 2.5 44 6 44 11c0 5.5-5 9-10 10 4 1.5 7 4.5 7 8.5 0 3.5-2.5 6-6 6-4.5 0-9-4.5-11-11" />
        <path d="M24 9c-1-3-2.5-5-4.5-6.5M24 9c1-3 2.5-5 4.5-6.5" />
      </g>
    </svg>
  );
}

/** Instagram glyph, drawn here rather than imported — lucide dropped brand icons. */
export function InstagramGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect
        x="2.5"
        y="2.5"
        width="19"
        height="19"
        rx="5.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" />
    </svg>
  );
}

/** WhatsApp glyph — same reason. */
export function WhatsAppGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.48 1.34 5L2 22l5.2-1.36a9.9 9.9 0 0 0 4.84 1.24h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2Zm0 18.13h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.1.81.83-3.02-.2-.31a8.16 8.16 0 0 1-1.26-4.36c0-4.55 3.7-8.25 8.24-8.25 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.55-3.7 8.21-8.25 8.21Zm4.52-6.15c-.25-.13-1.47-.72-1.69-.8-.23-.09-.39-.13-.56.12-.16.25-.64.8-.79.97-.14.16-.29.19-.54.06-.25-.12-1.05-.38-1.99-1.23-.74-.65-1.23-1.46-1.38-1.71-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.13-.14.17-.25.25-.41.09-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42l-.47-.01c-.16 0-.43.06-.65.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.54c.13.17 1.74 2.65 4.2 3.72.59.25 1.05.4 1.4.52.59.18 1.13.16 1.55.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.23-.17-.48-.29Z"
      />
    </svg>
  );
}
