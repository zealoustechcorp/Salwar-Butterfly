"use client";

/**
 * The shop's published size charts (F-06).
 *
 * These tables are printed on the storefront beside a Buy button — the
 * product page's size picker, every product tile, the bag, and the size
 * guide on /account all open the same dialog. Until this screen existed
 * they were two objects hardcoded in the frontend, which meant a row
 * corrected on the shop's printed card could only reach a shopper
 * through a developer. The migration that created the table seeded it
 * from exactly those numbers, so nothing a shopper reads changed on the
 * day this landed.
 *
 * Three gestures, softest first, which is the order they appear in each
 * row:
 *
 *   Published toggle  takes a chart off the storefront and keeps it. A
 *                     fit the shop stops cutting in April is worth
 *                     having back in October.
 *   Edit              a full replace, on its own route. The API has no
 *                     partial update of a measurement grid, because
 *                     dropping a column and clearing it are different
 *                     edits.
 *   Delete            destroys it. Behind a confirmation, and never the
 *                     first thing offered.
 *
 * Adding and editing are pages — /size-charts/new and
 * /size-charts/[id]/edit — rather than the dialog they were. A chart is
 * forty rows of numbers copied off a printed card, and a dialog that
 * tall scrolls inside a scrolling page, loses the work to a stray click
 * on the backdrop, and cannot be reloaded or opened in a second tab.
 * Only the delete confirmation is still a dialog, which is what a
 * dialog is for: one question, one answer, nothing to keep.
 *
 * The order the charts are listed in is the order their tabs appear in
 * on the storefront, which is why the arrows are here at all and why a
 * reorder sends the whole set: a partial one would leave two charts
 * sharing a position and the tabs settling somewhere nobody chose.
 */

import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  Ruler,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  LinkButton,
  Modal,
  SkeletonRows,
  Toggle,
  useToast,
} from "@/components/admin/ui";
import {
  deleteSizeChart,
  listSizeCharts,
  reorderSizeCharts,
  setSizeChartActive,
} from "@/lib/api/sizeCharts";
import { COLUMN_LABEL, measurement } from "@/lib/sizing";

export default function SizeChartsPage() {
  const toast = useToast();

  const [state, setState] = useState({ status: "loading", charts: [], error: null });
  const [reload, setReload] = useState(0);

  const [deleting, setDeleting] = useState(null);
  const [busyId, setBusyId] = useState(null);

  /**
   * The charts are the whole screen, so a reload leaves what is on it
   * alone until the new list arrives — the alternative is the tables
   * blinking out to skeletons every time a toggle refreshes them. Only
   * the first load has nothing to show, and the initial state covers it.
   */
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    listSizeCharts({ signal: controller.signal })
      .then((charts) => {
        if (active) setState({ status: "ready", charts, error: null });
      })
      .catch((error) => {
        if (active && error?.name !== "AbortError") {
          setState((current) => ({ ...current, status: "error", error }));
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  // --- writes ---------------------------------------------------------------

  async function togglePublished(chart) {
    setBusyId(chart.id);

    try {
      const saved = await setSizeChartActive(chart.id, !chart.active);

      setState((current) => ({
        ...current,
        charts: current.charts.map((row) => (row.id === saved.id ? saved : row)),
      }));

      toast.info(
        saved.active ? "Chart published" : "Chart hidden",
        `${saved.fit} is now ${saved.active ? "on" : "off"} the storefront.`,
      );
    } catch (error) {
      toast.error("Could not change that", error?.message);
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Moves a chart up or down the print order.
   *
   * The whole order goes up, not just the pair that swapped — the API
   * refuses a partial list rather than half-applying it, so a screen
   * that has gone stale is told so instead of renumbering charts
   * somebody else added.
   */
  async function moveChart(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= state.charts.length) return;

    const next = [...state.charts];
    const [chart] = next.splice(index, 1);
    next.splice(target, 0, chart);

    setBusyId(chart.id);
    setState((current) => ({ ...current, charts: next }));

    try {
      const saved = await reorderSizeCharts(next.map((row) => row.id));

      setState({ status: "ready", charts: saved, error: null });
    } catch (error) {
      toast.error("Could not reorder the charts", error?.message);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    const chart = deleting;

    setBusyId(chart.id);

    try {
      const remaining = await deleteSizeChart(chart.id);

      setState({ status: "ready", charts: remaining, error: null });
      setDeleting(null);
      toast.success("Size chart deleted", `${chart.fit} is gone.`);
    } catch (error) {
      toast.error("Could not delete that", error?.message);
    } finally {
      setBusyId(null);
    }
  }

  // --- render ---------------------------------------------------------------

  const published = state.charts.filter((chart) => chart.active).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Size charts"
          description={
            state.status === "ready"
              ? `${state.charts.length} chart${state.charts.length === 1 ? "" : "s"}, ${published} on the storefront. Listed in the order their tabs appear to a shopper.`
              : "The tables printed beside every size picker on the storefront."
          }
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={refresh} title="Reload">
                <RefreshCw className="size-3.5" />
              </Button>
              <LinkButton size="sm" variant="primary" href="/admin/size-charts/new">
                <Plus className="size-3.5" />
                Add a fit
              </LinkButton>
            </>
          }
        />

        {state.status === "loading" ? <SkeletonRows rows={3} /> : null}

        {state.status === "error" ? (
          <div className="p-4">
            <ErrorNotice error={state.error} onRetry={refresh} />
          </div>
        ) : null}

        {state.status === "ready" && state.charts.length === 0 ? (
          <EmptyState
            icon={<Ruler aria-hidden="true" />}
            title="No size charts"
            description="The storefront shows no size-chart button at all until there is one to open. Add the fit the shop cuts most."
            action={
              <LinkButton variant="primary" href="/admin/size-charts/new">
                <Plus className="size-3.5" />
                Add a fit
              </LinkButton>
            }
          />
        ) : null}
      </Card>

      {state.status === "ready"
        ? state.charts.map((chart, index) => (
            <ChartCard
              key={chart.id}
              chart={chart}
              busy={busyId === chart.id}
              first={index === 0}
              last={index === state.charts.length - 1}
              onMove={(delta) => moveChart(index, delta)}
              onToggle={() => togglePublished(chart)}
              onDelete={() => setDeleting(chart)}
            />
          ))
        : null}

      {/* ----------------------------------------------------------
          DELETE
          ---------------------------------------------------------- */}

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        size="sm"
        title="Delete this size chart?"
        description={deleting ? `${deleting.fit} — ${deleting.title}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={busyId === deleting?.id}
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-xs leading-relaxed text-ink-600">
          Deleting is permanent — the measurements are not kept anywhere else. To take
          the chart off the storefront without losing it, close this and use the
          published toggle instead.
        </p>
      </Modal>
    </div>
  );
}

/**
 * One chart, listed with the table it publishes.
 *
 * The preview is the whole table rather than a row count, because that
 * is what the shop is actually checking when it opens this screen: the
 * numbers, against the card in its hand.
 */
function ChartCard({ chart, busy, first, last, onMove, onToggle, onDelete }) {
  return (
    <Card className={chart.active ? undefined : "opacity-75"}>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {chart.fit}
            <Badge tone="slate">{chart.unit}</Badge>
            {chart.active ? null : <Badge tone="amber">Hidden</Badge>}
          </span>
        }
        description={chart.title}
        actions={
          <>
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={first || busy}
              title="Print earlier"
              className="inline-flex size-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ArrowUp className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={last || busy}
              title="Print later"
              className="inline-flex size-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ArrowDown className="size-4" />
            </button>

            <span
              className="ml-1 flex items-center gap-1.5 text-ink-500"
              title={chart.active ? "On the storefront" : "Hidden from the storefront"}
            >
              {chart.active ? (
                <Eye className="size-3.5" aria-hidden="true" />
              ) : (
                <EyeOff className="size-3.5" aria-hidden="true" />
              )}
              <Toggle
                size="sm"
                checked={chart.active}
                disabled={busy}
                onChange={onToggle}
                label={`Publish ${chart.fit}`}
              />
            </span>

            <LinkButton
              size="sm"
              variant="secondary"
              href={`/admin/size-charts/${chart.id}/edit`}
            >
              <Pencil className="size-3.5" />
              Edit
            </LinkButton>
            <Button size="sm" variant="danger" onClick={onDelete} disabled={busy}>
              <Trash2 className="size-3.5" />
            </Button>
          </>
        }
      />

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50/40">
              {chart.columns.map((column) => (
                <th
                  key={column}
                  className="px-4 py-2 font-mono text-[11px] font-semibold tracking-wider text-ink-600 uppercase"
                >
                  {COLUMN_LABEL[column] ?? column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {chart.rows.map((row) => (
              <tr key={row.size}>
                {chart.columns.map((column) => (
                  <td
                    key={column}
                    className={
                      column === "size"
                        ? "px-4 py-1.5 font-mono text-xs font-semibold text-ink-900"
                        : "px-4 py-1.5 font-mono text-xs text-ink-600"
                    }
                  >
                    {column === "size" ? row.size : measurement(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
