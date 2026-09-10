"use client";

/**
 * The shop's published size charts, and the button that opens them.
 *
 * One dialog, mounted wherever a shopper is choosing — or about to regret —
 * a size: the product page's size picker, every product tile's picker, the
 * bag before checkout, and the size-guide card on /account. They all read the
 * same charts from one context, so the shop's tables cannot drift between the
 * places a shopper reads them.
 *
 * The charts come from the database now, not from this file. The storefront
 * layout fetches them once per render (lib/store/sizeCharts.js) and hands them
 * to <SizeChartProvider>; everything below just renders whatever the shop has
 * published, however many fits that is. What stayed in lib/sizing.js is the
 * column headings, the pant length and the shop's guidance on reading a chart
 * — none of which is a property of any one fit.
 *
 * Three states, and they are three different answers rather than degrees of
 * the same one:
 *
 *   charts, from the API   render them
 *   [] from the API        the shop has withdrawn its charts. Render no
 *                          button at all — a "Size chart" link that opens an
 *                          empty dialog is worse than no link
 *   null (the fetch failed) fall back to the copy in lib/sizing.js, which is
 *                          the numbers the table was seeded with
 *
 * It is a Radix dialog for the same reason <AuthModal> is: the shopper is
 * interrupted mid-task — mid-size-pick, on a tile that only exists while it
 * is hovered — and when they dismiss it focus has to land back on the trigger
 * they opened it from.
 *
 * WHICH CHARTS A SHOPPER SEES
 *
 * A product records how it is cut in `attributes.fit`, and that value is the
 * name of one of these charts. Where it is known, this dialog prints that
 * chart and nothing else: a shopper reading a slim-fit table against an
 * anarkali is measuring the wrong garment, and the chips that used to let
 * them do it were a choice nobody could make correctly — the piece has one
 * cut, and only the shop knows which.
 *
 * Where it is not known — a product with no fit recorded, the bag, the size
 * guide on /account — every chart is shown, chips and all. That is the
 * behaviour this component has always had and it is still right for a
 * shopper who is not looking at one particular piece.
 *
 * A fit whose chart has been withdrawn falls back to showing them all rather
 * than to nothing. The piece is still on sale and the shopper still has to
 * pick a size; an empty dialog would leave them with nothing to read at all.
 */

import { Ruler, X } from "lucide-react";
import { Dialog as DialogPrimitive, Tabs as TabsPrimitive } from "radix-ui";
import { createContext, useContext } from "react";

import {
  columnLabel,
  FALLBACK_SIZE_CHARTS,
  garmentForCategory,
  measurement,
  MEASURES_NOTE,
  pantLengthFor,
  SIZE_UNIT,
  SIZING_NOTES,
} from "@/lib/sizing";
import { cn } from "@/lib/utils";

// --- the charts -------------------------------------------------------------

const SizeChartContext = createContext(undefined);

/**
 * Puts the shop's charts in reach of every trigger below the layout.
 *
 * A context rather than a prop, because the four places that open this
 * dialog are three levels apart and two of them — a product tile, the bag —
 * are client components rendered from lists that would otherwise have to
 * thread the charts through every card.
 *
 * @param {object} props
 * @param {Array<object>|null} props.charts - what the API returned, or null
 *        when it could not be read. Null takes the fallback; an empty array
 *        stays empty, because that is the shop's answer and not a failure.
 */
export function SizeChartProvider({ charts, children }) {
  return (
    <SizeChartContext.Provider value={charts ?? FALLBACK_SIZE_CHARTS}>
      {children}
    </SizeChartContext.Provider>
  );
}

/**
 * The published charts.
 *
 * Falls back outside a provider as well as on a failed fetch. That is for
 * the one case a provider cannot cover: a component rendered outside the
 * storefront layout — a preview, a test — should still show the shop's
 * charts rather than throw the way `useStore` does.
 */
export function useSizeCharts() {
  const charts = useContext(SizeChartContext);

  return charts === undefined ? FALLBACK_SIZE_CHARTS : charts;
}

/**
 * The charts that apply to one piece.
 *
 * Matched on the name, case-insensitively. The API stores the chart's own
 * spelling of the fit on the product, so an exact match is what is expected
 * here — the looser comparison is for a value that reached the column
 * before that rule existed, or through psql.
 *
 * Returns every chart when there is no fit to narrow by, and when the fit
 * names a chart the shop no longer publishes. Both are "we cannot say which
 * of these is yours", which is a different answer from "there is no chart".
 *
 * @param {Array<object>} charts
 * @param {string|null} [fit]
 */
function chartsFor(charts, fit) {
  const wanted = typeof fit === "string" ? fit.trim().toLowerCase() : "";

  if (!wanted) return charts;

  const matched = charts.filter(
    (chart) => String(chart.fit ?? "").trim().toLowerCase() === wanted,
  );

  return matched.length > 0 ? matched : charts;
}

// --- presentation -----------------------------------------------------------

const TRIGGER_CLASS = {
  /** Beside a size picker on the product page. */
  link: "inline-flex items-center gap-1.5 text-xs font-semibold text-sb-link underline underline-offset-4 transition-colors hover:text-sb-heading",
  /** In a product tile's overlay, where every pixel is spoken for. */
  compact:
    "inline-flex items-center gap-1 text-[10px] font-semibold text-sb-link underline underline-offset-2 transition-colors hover:text-sb-heading",
  /** A full-width pill, matching the secondary buttons it sits beside. */
  outline:
    "flex w-full items-center justify-center gap-2 rounded-full border border-sb-gold/50 px-5 py-2.5 text-xs font-semibold text-sb-heading transition-colors hover:bg-sb-surface/60",
};

const ICON_CLASS = {
  link: "size-3.5 shrink-0",
  compact: "size-3 shrink-0",
  outline: "size-3.5 shrink-0",
};

/**
 * One published chart, as a table.
 *
 * Every column but the size is a measurement, so the size cell is a row header
 * and the unit goes in the column heading once instead of in every cell. The
 * unit comes from the chart rather than from a constant: the shop prints in
 * inches, but a chart it sources in centimetres must not be printed under an
 * inches heading.
 */
function ChartTable({ chart }) {
  const unit = chart.unit ?? SIZE_UNIT;

  return (
    <div>
      <p className="font-display text-lg font-semibold text-sb-heading sm:text-xl">
        {chart.title}
      </p>
      {MEASURES_NOTE[chart.measures] ? (
        <p className="mt-1 text-xs leading-relaxed text-sb-text-muted">
          {MEASURES_NOTE[chart.measures]}
        </p>
      ) : null}

      {/*
        Five columns do not fit a small phone at a legible size, so this
        wrapper scrolls sideways under the table, with the bar hidden. No
        floor width to go with it: the table is left to its own intrinsic
        minimum so it overflows only on the narrowest screens, which is the
        only compensation there is for a scrollbar that no longer announces
        the last column.
      */}
      <div className="sb-no-scrollbar mt-2.5 overflow-x-auto rounded-xl border border-sb-gold/35">
        <table className="w-full border-collapse text-[13px] sm:text-sm">
          <caption className="sr-only">
            {chart.title} — all measurements in {unit === "cm" ? "centimetres" : "inches"}
          </caption>
          <thead>
            <tr className="bg-sb-surface/50">
              {chart.columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-2.5 py-2 text-left text-xs font-semibold whitespace-nowrap text-sb-heading sm:px-3.5 sm:py-2.5"
                >
                  {columnLabel(column)}
                  {column === "size" ? null : (
                    <span className="font-normal text-sb-text-muted"> ({unit})</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-sb-gold/25">
            {chart.rows.map((row) => (
              <tr key={row.size}>
                {chart.columns.map((column) =>
                  column === "size" ? (
                    <th
                      key={column}
                      scope="row"
                      className="px-2.5 py-2 text-left font-bold whitespace-nowrap text-sb-text sm:px-3.5 sm:py-2.5"
                    >
                      {row.size}
                    </th>
                  ) : (
                    <td
                      key={column}
                      className="px-2.5 py-2 text-sb-text tabular sm:px-3.5 sm:py-2.5"
                    >
                      {/* A blank cell is a dash, never a zero — see lib/sizing.js. */}
                      {measurement(row[column])}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The charts as a chip per fit, the pant length where the shop states one,
 * and the shop's own guidance on reading them.
 *
 * One table is shown at a time: stacked, they run past the fold of the dialog
 * and a shopper scrolls through a chart that may not even be theirs. The chips
 * are Radix tabs rather than hand-rolled buttons so the arrow keys move
 * between them and the panel is announced as the chip's own. A shop with one
 * published chart gets no chips at all — a single tab is a control with
 * nothing to choose.
 *
 * The pant length and the reading notes sit outside the tabs because they
 * apply to every chart — moving with the chip would suggest they change.
 *
 * Exported on its own so a page with room for the tables — the size guide on
 * /account, say — can print them inline instead of behind a button.
 *
 * @param {object} props
 * @param {"salwar" | "coord_set" | null} [props.garment] - The piece being
 *        looked at, for a pant length no chart has a column for. Omitted
 *        where the shopper is not on one particular piece.
 * @param {string|null} [props.fit] - How the piece is cut, from the
 *        product's attributes. Narrows the tables to that one chart.
 *        Omitted where the shopper is not on one particular piece, which
 *        shows them all.
 */
export function SizeChartTables({ garment = null, fit = null }) {
  const charts = chartsFor(useSizeCharts(), fit);
  const pantLength = pantLengthFor(garment);

  if (charts.length === 0) return null;

  return (
    <div className="space-y-5">
      <TabsPrimitive.Root defaultValue={charts[0].fit}>
        {charts.length > 1 ? (
          <TabsPrimitive.List
            aria-label="Which fit"
            className="flex flex-wrap gap-2 rounded-full border border-sb-gold/35 bg-sb-surface/25 p-1"
          >
            {charts.map((chart) => (
              <TabsPrimitive.Trigger
                key={chart.fit}
                value={chart.fit}
                className="flex-1 rounded-full px-3 py-2 text-xs font-semibold whitespace-nowrap text-sb-text transition-colors hover:text-sb-heading data-[state=active]:bg-sb-heading data-[state=active]:text-sb-bg sm:px-4 sm:text-sm"
              >
                {chart.fit}
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>
        ) : null}

        {charts.map((chart) => (
          <TabsPrimitive.Content
            key={chart.fit}
            value={chart.fit}
            className={cn(
              "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sb-link",
              charts.length > 1 && "mt-4",
            )}
          >
            <ChartTable chart={chart} />
          </TabsPrimitive.Content>
        ))}
      </TabsPrimitive.Root>

      {pantLength ? (
        <p className="rounded-xl bg-sb-surface/40 px-4 py-3 text-sm text-sb-text">
          <span className="font-semibold">Pant length: </span>
          <span className="tabular">{pantLength}</span> — no chart has a column for it
          because it does not change with the size. The shop cuts one length and alters on
          request.
        </p>
      ) : null}

      <div>
        <p className="text-sm font-bold text-sb-text">How to read these</p>
        <ul className="mt-2 space-y-1.5">
          {SIZING_NOTES.map((note) => (
            <li key={note} className="flex gap-2.5 text-xs leading-relaxed text-sb-text-muted">
              <span
                aria-hidden="true"
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sb-gold"
              />
              {note}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * The button that opens the charts.
 *
 * Renders nothing when the shop publishes no chart. A trigger that opens an
 * empty dialog is a promise the shop cannot keep, and every caller of this
 * sits beside a size picker that is still perfectly usable without it.
 *
 * @param {object} props
 * @param {string} [props.categoryName] - The piece's collection, which decides
 *        the pant length line and nothing else.
 * @param {string|null} [props.fit] - How the piece is cut, from the product's
 *        attributes. Given, the dialog shows that fit's chart alone. Omitted
 *        — in the bag, on the size guide — it shows every chart, because
 *        there is no one piece to narrow to.
 * @param {"link" | "compact" | "outline"} [props.variant] - How loud the
 *        trigger is, not what it opens.
 * @param {string} [props.label]
 * @param {string} [props.className]
 */
export function SizeChartButton({
  categoryName = null,
  fit = null,
  variant = "link",
  label = "Size chart",
  className,
}) {
  const published = useSizeCharts();
  const charts = chartsFor(published, fit);

  if (charts.length === 0) return null;

  // What the shopper is about to be shown, which is not always what the
  // shop publishes: one chart because this piece is cut to one fit reads
  // very differently from one chart because that is all there is.
  const narrowed = charts.length < published.length;

  // Named rather than an article — "a Slim Fit" is fine and "a Anarkali
  // Fit" is not, and the fits are the shop's own words to add to.
  const summary = narrowed
    ? `Showing the ${charts[0].fit} chart — this piece is cut to it.`
    : charts.length === 1
      ? "The shop publishes one chart."
      : `The shop publishes ${charts.length} charts, one per fit.`;

  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger className={cn(TRIGGER_CLASS[variant], className)}>
        <Ruler className={ICON_CLASS[variant]} aria-hidden="true" />
        {label}
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-sb-footer/50 backdrop-blur-[2px]" />
        {/*
          Wider than the sign-in dialog it borrows its shell from: this one
          holds a five-column table, and every inch of width here is an inch
          the table does not have to be scrolled sideways for. Below `sm` the
          viewport decides instead, with a smaller inset so a 320px phone
          still gets a usable line length; the body scrolls with no bar shown
          on it at all.
        */}
        <DialogPrimitive.Content className="sb-no-scrollbar sb-enter fixed top-1/2 left-1/2 z-50 max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-sb-gold/40 bg-sb-bg p-5 font-body shadow-2xl shadow-sb-footer/25 sm:w-[calc(100vw-2rem)] sm:p-7">
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute top-3 right-3 rounded-full p-2 text-sb-text-muted transition-colors hover:bg-sb-surface/70 hover:text-sb-heading sm:top-3.5 sm:right-3.5"
          >
            <X className="size-4" aria-hidden="true" />
          </DialogPrimitive.Close>

          <Ruler className="size-7 text-sb-gold-text" strokeWidth={1.2} aria-hidden="true" />
          <DialogPrimitive.Title className="mt-3 font-display text-2xl font-semibold text-sb-heading sm:text-3xl">
            Size chart
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1.5 text-sm text-sb-text-muted">
            {summary} Each column heading says what its measurements are in.
          </DialogPrimitive.Description>

          <div className="mt-5">
            <SizeChartTables garment={garmentForCategory(categoryName)} fit={fit} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
