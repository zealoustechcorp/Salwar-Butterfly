"use client";

/**
 * The home page carousel (F-06).
 *
 * These are the photographs in the first fold of the storefront — the
 * sliding panel beside the headline, which autoplays every five seconds
 * and is the first thing a visitor sees. Until this screen existed they
 * were a frozen array of five URLs in `lib/store/shop.js`, which meant a
 * festival banner could only reach the home page through a developer.
 * The migration that created the table seeded it from exactly those
 * five, so nothing a shopper saw changed on the day this landed.
 *
 * A banner is an image, a place in the order, and optionally the piece
 * it is a photograph of. There is still no title field and no caption —
 * the carousel renders each slide next to a headline that is already
 * there, and the shop composes whatever it wants said into the picture
 * itself. So the create form is a file picker, and nothing else; the
 * link is an edit afterwards, on the slides that want one.
 *
 * This screen is the set: what is running, in what order, and whether
 * each slide is in the rotation. Everything about *one* slide — where it
 * points, swapping its artwork, deleting it — is a screen of its own at
 * /admin/home/carousel/[id], reached by clicking the artwork. Those were
 * icons on the tile until they were not: a chain link, a bin and a pair
 * of arrows on a stamp-sized tile are four guesses about what is about to
 * happen to a live page, and the detail screen answers them in words.
 *
 * The order the tiles are listed in is the order the slides rotate,
 * which is why the arrows are here and why a reorder sends the whole
 * set: a partial one would leave two banners sharing a position and the
 * carousel settling somewhere nobody chose.
 *
 * What to upload is behind the Image guide button rather than a footnote
 * nobody reads. It is a panel and not a dialog: the shop reads it while
 * choosing a file, so it has to sit beside the Add button rather than
 * over the artwork it is describing.
 */

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Images,
  Link2,
  Link2Off,
  RefreshCw,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { BANNER_GUIDE, ImageGuide, ImageGuideButton } from "@/components/admin/ImageGuide";
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
  MAX_BANNERS,
  MAX_PER_UPLOAD,
  createBanners,
  listBanners,
  rejectionReason,
  reorderBanners,
  setBannerActive,
} from "@/lib/api/banners";

export default function CarouselPage() {
  const toast = useToast();

  const [state, setState] = useState({
    status: "loading",
    banners: [],
    error: null,
  });
  const [reload, setReload] = useState(0);

  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // Whether the "what to upload" panel is open. Closed by default: it is
  // read once by whoever is uploading and is noise to everyone else.
  const [guideOpen, setGuideOpen] = useState(false);

  const addRef = useRef(null);

  /**
   * The carousel is the whole screen, so a reload leaves what is on it
   * alone until the new list arrives — the alternative is the artwork
   * blinking out to skeletons every time a toggle refreshes it. Only the
   * first load has nothing to show, and the initial state covers it.
   */
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    listBanners({ signal: controller.signal })
      .then((banners) => {
        if (active) setState({ status: "ready", banners, error: null });
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

  const room = MAX_BANNERS - state.banners.length;

  // --- writes ---------------------------------------------------------------

  async function upload(fileList) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    // Checked here so a rejected file costs nothing; the API checks the
    // bytes themselves, which is the check that counts.
    const rejected = files.map(rejectionReason).filter(Boolean);

    if (rejected.length) {
      toast.error(
        rejected[0],
        rejected.length > 1 ? `And ${rejected.length - 1} more.` : undefined,
      );
      return;
    }

    if (files.length > MAX_PER_UPLOAD) {
      toast.error(`At most ${MAX_PER_UPLOAD} banners can be uploaded at once.`);
      return;
    }

    if (files.length > room) {
      toast.error(
        room === 0
          ? `The carousel already holds ${MAX_BANNERS} banners. Delete one before adding another.`
          : `Only ${room} more banner${room === 1 ? "" : "s"} fit — the carousel holds at most ${MAX_BANNERS}.`,
      );
      return;
    }

    setBusy(true);

    try {
      const { banners, added } = await createBanners(files);

      setState({ status: "ready", banners, error: null });
      toast.success(
        `${added} banner${added === 1 ? "" : "s"} added`,
        "Added to the end of the rotation. Use the arrows to move them.",
      );
    } catch (error) {
      toast.error("Could not add the banners", error?.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleShown(banner) {
    setBusyId(banner.id);

    try {
      const saved = await setBannerActive(banner.id, !banner.active);

      setState((current) => ({
        ...current,
        banners: current.banners.map((row) => (row.id === saved.id ? saved : row)),
      }));

      toast.info(
        saved.active ? "Banner shown" : "Banner hidden",
        saved.active
          ? "It is back in the rotation on the home page."
          : "It is out of the rotation, and kept.",
      );
    } catch (error) {
      toast.error("Could not change that", error?.message);
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Moves a slide earlier or later in the rotation.
   *
   * The whole order goes up, not just the pair that swapped — the API
   * refuses a partial list rather than half-applying it, so a screen
   * that has gone stale is told so instead of renumbering banners
   * somebody else uploaded.
   */
  async function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= state.banners.length) return;

    const next = [...state.banners];
    [next[index], next[target]] = [next[target], next[index]];

    setBusyId(next[target].id);
    // Shown in the new order straight away; the API's answer replaces it.
    setState((current) => ({ ...current, banners: next }));

    try {
      const saved = await reorderBanners(next.map((row) => row.id));

      setState({ status: "ready", banners: saved, error: null });
    } catch (error) {
      toast.error("Could not reorder the carousel", error?.message);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  // --- render ---------------------------------------------------------------

  const shown = state.banners.filter((banner) => banner.active).length;
  const locked = busy || Boolean(busyId);

  return (
    <div className="space-y-4">
      {/* Off-screen and driven by the button; a visible file input cannot
          be styled to match anything else on this screen. Replacing one
          slide's artwork lives on that slide's own screen. */}
      <input
        ref={addRef}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        disabled={locked || room <= 0}
        onChange={(e) => {
          upload(e.target.files);
          // Lets the same file be picked again after a failure.
          e.target.value = "";
        }}
      />

      <Card>
        <CardHeader
          title="Carousel"
          description={
            state.status === "ready"
              ? `${state.banners.length} banner${state.banners.length === 1 ? "" : "s"}, ${shown} in the rotation. Listed in the order they slide past on the home page.`
              : "The sliding photographs in the first fold of the home page."
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
                Add banners
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
              The carousel holds the maximum of {MAX_BANNERS} banners. Delete one to
              add another — or hide the ones that are out of season, which keeps
              them but still counts towards this limit.
            </p>
          </div>
        ) : null}

        {state.status === "ready" && state.banners.length === 0 ? (
          <EmptyState
            icon={<Images aria-hidden="true" />}
            title="No banners"
            description="With none, the home page draws an illustrated lockup where the photographs go. Upload the artwork the shop is running now."
            action={
              <Button variant="primary" onClick={() => addRef.current?.click()}>
                <Upload className="size-3.5" />
                Add banners
              </Button>
            }
          />
        ) : null}

        {state.status === "ready" && state.banners.length > 0 ? (
          <div className="p-4 pt-0">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {state.banners.map((banner, index) => (
                <BannerTile
                  key={banner.id}
                  banner={banner}
                  index={index}
                  total={state.banners.length}
                  busy={busyId === banner.id}
                  disabled={locked}
                  onMove={(delta) => move(index, delta)}
                  onToggle={() => toggleShown(banner)}
                />
              ))}
            </ul>

            <p className="mt-3 text-[11px] text-ink-500">
              JPEG, PNG or WebP · up to 5 MB each · {MAX_PER_UPLOAD} at a time.
              Slides are shown at 16:9 — artwork of any other shape is fitted
              inside that frame and the parts outside it are trimmed, so keep
              anything that matters near the middle. Open the Image guide above
              for the full list.
            </p>
          </div>
        ) : null}
      </Card>

      {/* What to upload, in words. The one dialog left on this screen, and
          the only thing here that decides nothing. */}
      <ImageGuide
        guide={BANNER_GUIDE}
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
      />
    </div>
  );
}

/**
 * One slide, shown as the artwork it is.
 *
 * The tile is the photograph rather than a filename and a date, because
 * that is what the shop is actually checking when it opens this screen:
 * which pictures are running, and in what order.
 *
 * The picture is also the way in. Clicking it opens the slide's own
 * screen, where the link, the artwork and deleting it are spelled out in
 * words — a tile this size can carry the two gestures that are about the
 * *set* (is it running, where in the order) and nothing more.
 */
function BannerTile({ banner, index, total, busy, disabled, onMove, onToggle }) {
  const locked = disabled || busy;
  const href = `/admin/home/carousel/${banner.id}`;

  // Three states, and only the third is a problem: no link at all (the
  // ordinary slide), a link to a piece on sale, and a link to a piece the
  // shop has since taken off sale — which still renders the banner but
  // silently stops it going anywhere.
  const stale = Boolean(banner.productId) && banner.productActive === false;

  return (
    <li
      className={cx(
        "overflow-hidden rounded-lg ring-1 ring-ink-200",
        banner.active ? undefined : "opacity-75",
      )}
    >
      {/* 16:9, matching the frame on the home page exactly — this tile is
          what the shop judges a banner by, so it has to crop and fill the
          way the real carousel does.

          The whole picture is the link, and it says so on hover rather
          than only by turning into a pointer: a photograph that quietly
          navigates is the same guess the icons were. */}
      <Link
        href={href}
        className="group relative block focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
      >
        <MediaFrame src={banner.image} ratio="aspect-16/9" />

        <span className="absolute inset-0 grid place-items-center bg-ink-900/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-ink-800">
            Open this slide
          </span>
        </span>

        <span className="absolute top-1.5 left-1.5">
          <Badge tone={banner.active ? "brand" : "amber"}>
            {banner.active ? `Slide ${index + 1}` : "Hidden"}
          </Badge>
        </span>
      </Link>

      <div className="space-y-1.5 border-t border-ink-200 p-2">
        {/* The toggle says what it means in words beside it. On its own it
            was a switch with an eye next to it, which is two symbols for
            a fact — "this is on the home page" — that costs four words. */}
        <span className="flex items-center gap-1.5 text-[11px] text-ink-600">
          {banner.active ? (
            <Eye className="size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <EyeOff className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          <Toggle
            size="sm"
            checked={banner.active}
            disabled={locked}
            onChange={onToggle}
            label={`Show banner ${index + 1} on the home page`}
          />
          <span className="truncate">
            {banner.active ? "On the home page" : "Hidden"}
          </span>
        </span>

        {/* Where this slide points, in one line. Printed for every tile
            rather than only the linked ones: "links nowhere" is a fact
            the shop is checking when it opens this screen, and a line
            that appears and disappears is one the eye stops looking for. */}
        <p
          className={cx(
            "flex items-center gap-1.5 text-[11px]",
            stale ? "text-amber-700" : "text-ink-500",
          )}
          title={banner.productName || banner.productId || "Links nowhere"}
        >
          {banner.productId ? (
            stale ? (
              <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
            ) : (
              <Link2 className="size-3 shrink-0" aria-hidden="true" />
            )
          ) : (
            <Link2Off className="size-3 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">
            {!banner.productId
              ? "Links nowhere"
              : stale
                ? `${banner.productName || "That piece"} is off sale — the slide will not link`
                : banner.productName}
          </span>
        </p>

        <div className="flex flex-wrap items-center justify-between gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="px-1.5"
            disabled={locked || index === 0}
            aria-label={`Move banner ${index + 1} earlier`}
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
            aria-label={`Move banner ${index + 1} later`}
            onClick={() => onMove(1)}
          >
            Later
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        </div>

        {/* The way to everything else: the link, the artwork, deleting.
            A word, not a row of glyphs. */}
        <LinkButton size="sm" variant="secondary" href={href} className="w-full">
          Open this slide
        </LinkButton>
      </div>
    </li>
  );
}
