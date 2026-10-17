"use client";

/**
 * The hand-picked shelves on the home page (F-06).
 *
 * A section is a titled row of products the shop chose by hand — Best
 * sellers, a Diwali or Pongal sale, a Wedding edit — drawn in one of three
 * layouts. This screen is the stack: which shelves exist, in what order
 * they appear down the home page, and whether each is showing right now.
 * Everything about *one* shelf — its words, its window, its look, its
 * pieces — is the editor at /admin/home/sections/[id].
 *
 * "Showing right now" is two things, and the pill says which. The switch
 * is the shop's say; the window (start and end, in shop time) is the
 * calendar's. A Pongal shelf can be set up in December, switched on, and
 * left: it reads Scheduled until its start and Ended after its end,
 * without anyone coming back to it. Old festival shelves are kept,
 * switched off, for next year — which is why the limit is thirty.
 *
 * Delete asks in place, on the row it will remove, like the stories
 * editor. Nothing opens over the list.
 */

import {
  ArrowDown,
  ArrowUp,
  LayoutList,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  LinkButton,
  SkeletonRows,
  Toggle,
  cx,
  useToast,
} from "@/components/admin/ui";
import {
  MAX_SECTIONS,
  deleteSection,
  formatWindow,
  listSections,
  reorderSections,
  sectionStatus,
  setSectionActive,
} from "@/lib/api/homeSections";
import { SHELF_LAYOUTS } from "@/lib/store/shelfThemes";

const BASE = "/admin/home/sections";

/** The pill for each status — the words, and what colour they are. */
const STATUS = {
  live: { label: "Live", tone: "green" },
  scheduled: { label: "Scheduled", tone: "gold" },
  ended: { label: "Ended", tone: "slate" },
  off: { label: "Off", tone: "neutral" },
};

const layoutLabel = (id) =>
  SHELF_LAYOUTS.find((layout) => layout.id === id)?.label ?? id;

export default function HomeSectionsPage() {
  const toast = useToast();

  const [state, setState] = useState({
    status: "loading",
    sections: [],
    error: null,
  });
  const [reload, setReload] = useState(0);

  const [busyId, setBusyId] = useState(null);

  // The row whose Delete has been pressed once and is asking to be sure.
  const [confirmingId, setConfirmingId] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    listSections({ signal: controller.signal })
      .then((sections) => {
        if (active) setState({ status: "ready", sections, error: null });
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

  const room = MAX_SECTIONS - state.sections.length;
  const locked = Boolean(busyId);

  // --- writes ---------------------------------------------------------------

  async function toggleActive(section) {
    setBusyId(section.id);

    try {
      const saved = await setSectionActive(section.id, !section.active);

      setState((current) => ({
        ...current,
        sections: current.sections.map((row) => (row.id === saved.id ? saved : row)),
      }));

      const status = sectionStatus(saved);

      toast.info(
        saved.active ? "Section switched on" : "Section switched off",
        !saved.active
          ? "It is off the home page, and kept with its pieces."
          : status === "scheduled"
            ? "It will appear on the home page when its start date arrives."
            : status === "ended"
              ? "Its end date has passed, so it is still not showing. Change the dates to bring it back."
              : "It is on the home page.",
      );
    } catch (error) {
      toast.error("Could not change that", error?.message);
    } finally {
      setBusyId(null);
    }
  }

  async function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= state.sections.length) return;

    const next = [...state.sections];
    [next[index], next[target]] = [next[target], next[index]];

    setBusyId(next[target].id);
    setState((current) => ({ ...current, sections: next }));

    try {
      const saved = await reorderSections(next.map((row) => row.id));

      setState({ status: "ready", sections: saved, error: null });
    } catch (error) {
      toast.error("Could not reorder the sections", error?.message);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function destroy(section) {
    setBusyId(section.id);

    try {
      const sections = await deleteSection(section.id);

      setState({ status: "ready", sections, error: null });
      setConfirmingId(null);
      toast.success("Section deleted", "The products themselves were not touched.");
    } catch (error) {
      toast.error("Could not delete that", error?.message);
    } finally {
      setBusyId(null);
    }
  }

  // --- render ---------------------------------------------------------------

  const live = state.sections.filter((row) => sectionStatus(row) === "live").length;

  const newButton = (
    <LinkButton
      size="sm"
      variant="primary"
      href={`${BASE}/new`}
      aria-disabled={room <= 0 || undefined}
      className={room <= 0 ? "pointer-events-none opacity-50" : undefined}
    >
      <Plus className="size-3.5" aria-hidden="true" />
      New section
    </LinkButton>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Home page sections"
          description={
            state.status === "ready"
              ? `${state.sections.length} section${state.sections.length === 1 ? "" : "s"}, ${live} live now. Listed in the order they appear down the home page.`
              : "Hand-picked rows of products on the home page."
          }
          actions={
            <>
              <Button
                size="sm"
                variant="ghost"
                className="size-9 px-0 sm:size-8"
                onClick={refresh}
                title="Reload"
              >
                <RefreshCw className="size-3.5" />
              </Button>
              {newButton}
            </>
          }
        />

        {state.status === "loading" ? <SkeletonRows rows={3} /> : null}

        {state.status === "error" ? (
          <div className="p-4">
            <ErrorNotice error={state.error} onRetry={refresh} />
          </div>
        ) : null}

        {state.status === "ready" && room <= 0 ? (
          <div className="px-4 pt-4">
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
              There are {MAX_SECTIONS} sections, which is the most this screen holds.
              Delete an old one to add another.
            </p>
          </div>
        ) : null}

        {state.status === "ready" && state.sections.length === 0 ? (
          <EmptyState
            icon={<LayoutList aria-hidden="true" />}
            title="No sections yet"
            description="A section is a row of products you pick by hand, with a title over it — Best sellers, a Diwali or Pongal sale, a Wedding or Office Wear collection. Give it dates and it appears and disappears on its own; the home page shows none until there is one."
            action={newButton}
          />
        ) : null}

        {state.status === "ready" && state.sections.length > 0 ? (
          <ul className="divide-y divide-ink-200/80">
            {state.sections.map((section, index) => (
              <SectionRow
                key={section.id}
                section={section}
                index={index}
                total={state.sections.length}
                busy={busyId === section.id}
                disabled={locked}
                confirming={confirmingId === section.id}
                onMove={(delta) => move(index, delta)}
                onToggle={() => toggleActive(section)}
                onAskDelete={() => setConfirmingId(section.id)}
                onCancelDelete={() => setConfirmingId(null)}
                onDelete={() => destroy(section)}
              />
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}

// ============================================================
// ONE ROW
// ============================================================

function SectionRow({
  section,
  index,
  total,
  busy,
  disabled,
  confirming,
  onMove,
  onToggle,
  onAskDelete,
  onCancelDelete,
  onDelete,
}) {
  const status = STATUS[sectionStatus(section)];
  const locked = disabled || busy;
  const href = `${BASE}/${section.id}`;

  return (
    <li className={cx("px-4 py-3 sm:px-5", section.active ? undefined : "bg-ink-50/50")}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-0.5 w-6 shrink-0 text-xs font-semibold tabular-nums text-ink-400">
          {index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={href}
              className="truncate text-sm font-semibold text-ink-900 hover:underline"
            >
              {section.title}
            </Link>
            <Badge tone={status.tone}>{status.label}</Badge>
          </p>
          <p className="mt-1 text-xs text-ink-500">
            {layoutLabel(section.layout)} · {section.productCount}{" "}
            {section.productCount === 1 ? "piece" : "pieces"} · {formatWindow(section)}
            {section.startsAt || section.endsAt ? " (IST)" : ""}
          </p>
        </div>

        {/* The switch says what it means in words beside it, the same as
            the stories wall. */}
        <span className="flex items-center gap-1.5 text-[11px] text-ink-600">
          <Toggle
            size="sm"
            checked={section.active}
            disabled={locked}
            onChange={onToggle}
            label={`Switch on ${section.title}`}
          />
          <span className="w-6">{section.active ? "On" : "Off"}</span>
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1 pl-9">
        <Button
          size="sm"
          variant="ghost"
          className="h-9 px-1.5 sm:h-8"
          disabled={locked || index === 0}
          aria-label={`Move ${section.title} up`}
          onClick={() => onMove(-1)}
        >
          <ArrowUp className="size-3.5" aria-hidden="true" />
          Up
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-9 px-1.5 sm:h-8"
          disabled={locked || index === total - 1}
          aria-label={`Move ${section.title} down`}
          onClick={() => onMove(1)}
        >
          <ArrowDown className="size-3.5" aria-hidden="true" />
          Down
        </Button>
        <LinkButton size="sm" variant="secondary" href={href}>
          <Pencil className="size-3.5" aria-hidden="true" />
          Edit
        </LinkButton>
        {confirming ? null : (
          <Button size="sm" variant="danger" disabled={locked} onClick={onAskDelete}>
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete
          </Button>
        )}
      </div>

      {/* Asked here, on the row it removes. Switching off is the way to
          keep a festival shelf for next year, and the question says so. */}
      {confirming ? (
        <div className="mt-2 ml-9 rounded-lg bg-red-50 p-3 ring-1 ring-inset ring-red-200">
          <p className="text-xs leading-relaxed text-red-800">
            Delete &ldquo;{section.title}&rdquo; and its list of picked pieces? The
            products themselves are not touched. To keep it for next time, switch it
            off instead.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="danger" busy={busy} disabled={disabled && !busy} onClick={onDelete}>
              <Trash2 className="size-3.5" aria-hidden="true" />
              Yes, delete this section
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={onCancelDelete}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
