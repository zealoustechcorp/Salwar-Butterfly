"use client";

/**
 * The page around <SizeChartBuilder> (F-06).
 *
 * The builder is the grid and nothing else — it holds no state and has
 * no save. This is the rest of a screen: the heading, the validation
 * that runs before the request, and the bar at the bottom with Save in
 * it. Both routes mount it, `/admin/size-charts/new` and
 * `/admin/size-charts/[id]/edit`, because the API's update is a full
 * replace and there is no difference between the two worth branching on.
 *
 * A chart is forty rows of numbers transcribed off a printed card. That
 * is why it is a page rather than the dialog it used to be: a dialog
 * this tall scrolls inside a scrolling page, loses the work to a stray
 * click on the backdrop, and cannot be linked to, reloaded or opened in
 * a second tab while the card is in the shop's other hand.
 *
 * The caller owns the request. `onSave` does the API call, the toast and
 * the redirect, and throws on failure — field errors off the thrown
 * ApiError are caught here and handed to the builder, which marks the
 * cells they name.
 */

import { ArrowLeft } from "lucide-react";
import { useState } from "react";

import SizeChartBuilder from "./SizeChartBuilder";
import { Button, Card, CardHeader, LinkButton, useToast } from "./ui";
import {
  collect,
  hasErrors,
  summarizeErrors,
  validateSizeChartRows,
} from "@/lib/validate";

export default function SizeChartForm({ chart, editing = false, onSave, onCancel }) {
  const toast = useToast();

  const [draft, setDraft] = useState(chart);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  async function submit() {
    // The grid is checked before the request, not after it. A cell holding
    // 0 or -5 is refused by the API with a perfectly good message that
    // arrives once the shop has transcribed forty rows off a printed card;
    // the same message here arrives while they are still looking at it.
    const invalid = collect([
      ["fit", draft.fit.trim() ? null : "A fit name is required"],
      ["title", draft.title.trim() ? null : "A title is required"],
      [
        "columns",
        draft.columns.length >= 2
          ? null
          : "A chart needs at least 2 columns: size, and something to measure",
      ],
      ["rows", validateSizeChartRows(draft.rows, draft.columns)],
    ]);

    if (hasErrors(invalid)) {
      setFieldErrors(invalid);
      toast.error("Check the chart", summarizeErrors(invalid));
      return;
    }

    setSaving(true);
    setFieldErrors({});

    try {
      await onSave(draft);
      // No `setSaving(false)` on the way out: the caller is navigating,
      // and a button that flicks back to idle mid-route reads as a save
      // that did not take.
    } catch (error) {
      // The API returns a field map for a bad chart and a sentence for
      // everything else. Both are shown, in the place each belongs: the
      // map next to the fields, the sentence in a toast.
      setFieldErrors(error?.fields ?? {});
      toast.error(
        editing ? "Could not update the chart" : "Could not publish the chart",
        error?.message,
      );
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">
            {editing ? `Edit ${chart.fit || "size chart"}` : "Add a fit"}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Whatever is saved here is what a shopper reads next to the size
            picker.
          </p>
        </div>

        <LinkButton variant="ghost" href="/admin/size-charts">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to size charts
        </LinkButton>
      </div>

      <Card>
        <CardHeader
          title="The chart"
          description="The fit names the tab on the storefront; the grid is the table printed beneath it."
        />
        <div className="p-5">
          <SizeChartBuilder chart={draft} onChange={setDraft} errors={fieldErrors} />
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <p className="text-xs text-ink-500">
            {draft.rows.length} size{draft.rows.length === 1 ? "" : "s"} ·{" "}
            {draft.columns.length - 1} measurement
            {draft.columns.length - 1 === 1 ? "" : "s"} · {draft.unit}
          </p>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" size="lg" busy={saving} onClick={submit}>
              {editing ? "Save chart" : "Publish chart"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
