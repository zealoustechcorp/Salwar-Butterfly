"use client";

/**
 * What customers have sent the shop (F-06.08).
 *
 * These are the cards in the customer rail on the home page. The shop
 * collects what people send it — a photograph of the piece being worn, a
 * message about an order — and publishes a selection here. There is no
 * shopper write path anywhere in the stack: what appears on the home
 * page is what somebody chose on this screen.
 *
 * A story is always a photograph. Adding is Add photos and nothing else:
 * a batch of pictures becomes a card each, with nothing typed, and a
 * name or a quote is an edit afterwards on the few that have one. There
 * is no way to publish words on their own — the rail on the home page is
 * built out of pictures, and a card with an empty frame reads as
 * something that failed to load rather than as a quote.
 *
 * New stories go to the *front*, which is the opposite of the carousel
 * next door. A banner set is a sequence the shop composes; stories
 * accumulate over months, and the fresh ones are the ones worth showing.
 *
 * This screen is the wall: which photographs are up, in what order, and
 * whether each is published. Everything about *one* card — the quote,
 * the name, the piece it names, swapping the photograph, deleting it —
 * is a screen of its own at /admin/home/stories/[id], reached by
 * clicking the photograph. Those were a pencil and a bin on a tile the
 * size of a stamp; now each one is a labelled control on a page with the
 * picture beside it, and nothing opens over the wall to ask.
 *
 * What to upload is behind the Image guide button, which is the one
 * dialog here — it decides nothing, it is read once before picking a
 * file.
 */

import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  MessageSquareQuote,
  RefreshCw,
  TriangleAlert,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ImageGuide, ImageGuideButton, STORY_GUIDE } from "@/components/admin/ImageGuide";
import { MediaFrame } from "@/components/admin/MediaFrame";
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
  ACCEPT_ATTRIBUTE,
  MAX_PER_UPLOAD,
  MAX_STORIES,
  createStoriesFromImages,
  listStories,
  rejectionReason,
  reorderStories,
  setStoryPublished,
} from "@/lib/api/customerStories";

export default function CustomerStoriesPage() {
  const toast = useToast();

  const [state, setState] = useState({
    status: "loading",
    stories: [],
    error: null,
  });
  const [reload, setReload] = useState(0);

  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // Whether the "what to upload" dialog is open. Closed by default: it is
  // read once by whoever is uploading and is noise to everyone else.
  const [guideOpen, setGuideOpen] = useState(false);

  const addRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    listStories({ signal: controller.signal })
      .then((stories) => {
        if (active) setState({ status: "ready", stories, error: null });
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

  const room = MAX_STORIES - state.stories.length;
  const locked = busy || Boolean(busyId);

  // --- writes ---------------------------------------------------------------

  async function upload(fileList) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    const rejected = files.map(rejectionReason).filter(Boolean);

    if (rejected.length) {
      toast.error(
        rejected[0],
        rejected.length > 1 ? `And ${rejected.length - 1} more.` : undefined,
      );
      return;
    }

    if (files.length > MAX_PER_UPLOAD) {
      toast.error(`At most ${MAX_PER_UPLOAD} photographs can be uploaded at once.`);
      return;
    }

    if (files.length > room) {
      toast.error(
        room === 0
          ? `There are already ${MAX_STORIES} stories. Delete one before adding another.`
          : `Only ${room} more fit${room === 1 ? "" : ""} — ${MAX_STORIES} is the most this screen holds.`,
      );
      return;
    }

    setBusy(true);

    try {
      const { stories, added } = await createStoriesFromImages(files);

      setState({ status: "ready", stories, error: null });
      toast.success(
        `${added} ${added === 1 ? "story" : "stories"} added`,
        "Added to the front. Open one to add a name or a quote.",
      );
    } catch (error) {
      toast.error("Could not add the photographs", error?.message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(story) {
    setBusyId(story.id);

    try {
      const saved = await setStoryPublished(story.id, !story.published);

      setState((current) => ({
        ...current,
        stories: current.stories.map((row) => (row.id === saved.id ? saved : row)),
      }));

      toast.info(
        saved.published ? "Story published" : "Story hidden",
        saved.published
          ? "It is on the home page."
          : "It is off the home page, and kept.",
      );
    } catch (error) {
      toast.error("Could not change that", error?.message);
    } finally {
      setBusyId(null);
    }
  }

  async function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= state.stories.length) return;

    const next = [...state.stories];
    [next[index], next[target]] = [next[target], next[index]];

    setBusyId(next[target].id);
    setState((current) => ({ ...current, stories: next }));

    try {
      const saved = await reorderStories(next.map((row) => row.id));

      setState({ status: "ready", stories: saved, error: null });
    } catch (error) {
      toast.error("Could not reorder the stories", error?.message);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  // --- render ---------------------------------------------------------------

  const published = state.stories.filter((story) => story.published).length;

  return (
    <div className="space-y-4">
      <input
        ref={addRef}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        disabled={locked || room <= 0}
        onChange={(e) => {
          upload(e.target.files);
          e.target.value = "";
        }}
      />
      <Card>
        <CardHeader
          title="Customer stories"
          description={
            state.status === "ready"
              ? `${state.stories.length} stor${state.stories.length === 1 ? "y" : "ies"}, ${published} on the home page. Listed in the order the cards appear.`
              : "Photographs and messages customers have sent, published on the home page."
          }
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={refresh} title="Reload">
                <RefreshCw className="size-3.5" />
              </Button>
              <ImageGuideButton onOpen={() => setGuideOpen(true)} />
              <Button
                size="sm"
                variant="primary"
                busy={busy}
                disabled={locked || room <= 0}
                onClick={() => addRef.current?.click()}
              >
                <Upload className="size-3.5" />
                Add photos
              </Button>
            </>
          }
        />

        {state.status === "loading" ? <SkeletonRows rows={2} /> : null}

        {state.status === "error" ? (
          <div className="p-4">
            <ErrorNotice error={state.error} onRetry={refresh} />
          </div>
        ) : null}

        {state.status === "ready" && room <= 0 ? (
          <div className="px-4 pb-4">
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
              There are {MAX_STORIES} stories, which is the most this screen holds.
              Delete one to add another.
            </p>
          </div>
        ) : null}

        {state.status === "ready" && state.stories.length === 0 ? (
          <EmptyState
            icon={<MessageSquareQuote aria-hidden="true" />}
            title="No customer stories"
            description="The home page shows no customer section at all until there is one to show. Upload the photographs customers have sent — a name and a quote can be added to each afterwards."
            action={
              <Button variant="primary" onClick={() => addRef.current?.click()}>
                <Upload className="size-3.5" />
                Add photos
              </Button>
            }
          />
        ) : null}

        {state.status === "ready" && state.stories.length > 0 ? (
          <div className="p-4 pt-0">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {state.stories.map((story, index) => (
                <StoryTile
                  key={story.id}
                  story={story}
                  index={index}
                  total={state.stories.length}
                  busy={busyId === story.id}
                  disabled={locked}
                  onMove={(delta) => move(index, delta)}
                  onToggle={() => togglePublished(story)}
                />
              ))}
            </ul>

            <p className="mt-3 text-[11px] text-ink-500">
              JPEG, PNG or WebP · up to 5 MB each · {MAX_PER_UPLOAD} at a time. The
              home page shows the first 24 in this order, each in a 9:16 card. A
              photograph of any other shape is fitted inside that card and the
              parts outside it are trimmed, so keep the subject near the middle.
              Open the Image guide above for the full list.
            </p>
          </div>
        ) : null}
      </Card>

      {/* What to upload, in words. The one dialog on this screen, and the
          only thing here that decides nothing. */}
      <ImageGuide
        guide={STORY_GUIDE}
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
      />
    </div>
  );
}

// ============================================================
// ONE CARD
// ============================================================

function StoryTile({ story, index, total, busy, disabled, onMove, onToggle }) {
  const locked = disabled || busy;
  const href = `/admin/home/stories/${story.id}`;

  return (
    <li
      className={cx(
        "flex flex-col overflow-hidden rounded-lg ring-1 ring-ink-200",
        story.published ? undefined : "opacity-75",
      )}
    >
      {/* 9:16, matching the card on the home page exactly — this tile is
          what the shop judges a photograph by, so it has to crop and fill
          the way the real rail does.

          The whole photograph is the way in to the card's own screen, and
          it says so on hover rather than only by turning into a pointer. */}
      <Link
        href={href}
        className="group relative block shrink-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
      >
        <MediaFrame src={story.image} ratio="aspect-9/16" />

        <span className="absolute inset-0 grid place-items-center bg-ink-900/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-ink-800">
            Open this card
          </span>
        </span>

        <span className="absolute top-1.5 left-1.5">
          <Badge tone={story.published ? "brand" : "amber"}>
            {story.published ? `#${index + 1}` : "Hidden"}
          </Badge>
        </span>
      </Link>

      <div className="flex flex-1 flex-col gap-1.5 border-t border-ink-200 p-2">
        <div className="min-h-8 flex-1">
          {story.body ? (
            <p className="line-clamp-3 text-[11px] leading-relaxed text-ink-600">
              &ldquo;{story.body}&rdquo;
            </p>
          ) : null}

          {story.customerName ? (
            <p className="mt-1 truncate text-[11px] font-medium text-ink-800">
              {story.customerName}
            </p>
          ) : null}

          {!story.body && !story.customerName ? (
            <p className="text-[11px] text-ink-400">
              Photograph only — no name or quote yet.
            </p>
          ) : null}

          {story.productId ? (
            <p
              className={cx(
                "mt-1 flex items-start gap-1 truncate text-[11px]",
                story.productActive === false ? "text-amber-700" : "text-ink-500",
              )}
              title={story.productName || story.productId}
            >
              {story.productActive === false ? (
                <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden="true" />
              ) : null}
              <span className="truncate">
                {story.productActive === false
                  ? `${story.productName || "That piece"} is off sale — the card will not link`
                  : `on ${story.productName}`}
              </span>
            </p>
          ) : null}
        </div>

        {/* The toggle says what it means in words beside it. On its own it
            was a switch with an eye next to it, which is two symbols for a
            fact — "this is on the home page" — that costs four words. */}
        <span className="flex items-center gap-1.5 text-[11px] text-ink-600">
          {story.published ? (
            <Eye className="size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <EyeOff className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          <Toggle
            size="sm"
            checked={story.published}
            disabled={locked}
            onChange={onToggle}
            label={`Publish story ${index + 1} on the home page`}
          />
          <span className="truncate">
            {story.published ? "On the home page" : "Hidden"}
          </span>
        </span>

        <div className="flex flex-wrap items-center justify-between gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="px-1.5"
            disabled={locked || index === 0}
            aria-label={`Move story ${index + 1} earlier`}
            onClick={() => onMove(-1)}
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Earlier
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="px-1.5"
            disabled={locked || index === total - 1}
            aria-label={`Move story ${index + 1} later`}
            onClick={() => onMove(1)}
          >
            Later
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        </div>

        {/* The way to everything else: the quote, the name, the piece, the
            photograph, deleting. A word, not a row of glyphs. */}
        <LinkButton size="sm" variant="secondary" href={href} className="w-full">
          Open this card
        </LinkButton>
      </div>
    </li>
  );
}
