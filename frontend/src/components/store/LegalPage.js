import { Mail, Phone } from "lucide-react";

import { Butterfly, WhatsAppGlyph } from "./Ornaments";

/**
 * The shared shell for the shop's published policies (/privacy, /returns).
 *
 * These pages carry legal text the shop is bound by, so the wording lives in
 * the route that owns it and this component only lays it out — nothing here
 * paraphrases, summarises or reorders what a section says.
 *
 * A section is `{ heading, body?: string[], list?: string[], after?: string[] }`:
 * paragraphs, then bullets, then any paragraphs that must follow the bullets.
 * The contact block at the foot is built from SHOP, so the number and address
 * on a policy page can never drift from the one in the header and footer.
 */
export function LegalPage({ eyebrow, title, updated, intro, sections, shop }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-9 sm:px-6 sm:py-11 lg:px-8 lg:py-13">
      <p className="sb-eyebrow flex items-center gap-2 text-[10px] text-sb-gold-text">
        <Butterfly className="size-5 text-sb-maroon-deco" aria-hidden="true" />
        {eyebrow}
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
        {title}
      </h1>
      <div className="sb-rule mt-4 h-px w-40" aria-hidden="true" />
      <p className="mt-4 text-xs text-sb-text-muted">Last updated: {updated}</p>

      <p className="mt-5 text-sm leading-relaxed text-sb-text sm:text-base">{intro}</p>

      <div className="mt-8 space-y-7">
        {sections.map((section, index) => (
          <div key={section.heading}>
            <h2 className="font-display text-xl font-semibold text-sb-heading sm:text-2xl">
              <span className="text-sb-gold-text tabular">{index + 1}. </span>
              {section.heading}
            </h2>

            {section.body?.map((paragraph) => (
              <p key={paragraph} className="mt-2.5 text-sm leading-relaxed text-sb-text">
                {paragraph}
              </p>
            ))}

            {section.list ? (
              <ul className="mt-2.5 space-y-1.5">
                {section.list.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2.5 text-sm leading-relaxed text-sb-text"
                  >
                    <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-sb-gold" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}

            {section.after?.map((paragraph) => (
              <p key={paragraph} className="mt-2.5 text-sm leading-relaxed text-sb-text">
                {paragraph}
              </p>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-9 rounded-2xl border border-sb-gold/35 bg-sb-surface/25 p-5 sm:p-6">
        <p className="font-display text-xl font-semibold text-sb-heading">Contact us</p>
        <p className="mt-2 text-sm leading-relaxed text-sb-text">
          Questions about this policy, or about an order it covers? Reach {shop.name} on any of
          these — WhatsApp is the fastest.
        </p>
        <ul className="mt-4 space-y-2.5 text-sm text-sb-text">
          <li className="flex gap-2.5">
            <WhatsAppGlyph className="mt-0.5 size-4 shrink-0 text-sb-gold-text" />
            <a
              href={shop.whatsapp}
              target="_blank"
              rel="noreferrer noopener"
              className="font-semibold text-sb-link underline underline-offset-4"
            >
              WhatsApp us
            </a>
          </li>
          <li className="flex gap-2.5">
            <Phone className="mt-0.5 size-4 shrink-0 text-sb-gold-text" aria-hidden="true" />
            <a
              href={`tel:+91${shop.phone}`}
              className="font-semibold text-sb-link underline underline-offset-4 tabular"
            >
              +91 {shop.phone}
            </a>
          </li>
          <li className="flex gap-2.5">
            <Mail className="mt-0.5 size-4 shrink-0 text-sb-gold-text" aria-hidden="true" />
            <a
              href={`mailto:${shop.email}`}
              className="font-semibold break-all text-sb-link underline underline-offset-4"
            >
              {shop.email}
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}
