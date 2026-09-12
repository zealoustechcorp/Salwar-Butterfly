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
 * Four gestures, softest first, which is also the order they appear on
 * each tile:
 *
 *   Shown toggle  takes a slide out of the rotation and keeps it. A
 *                 Diwali banner pulled in November is worth having back
 *                 next October.
 *   Link          points the slide at a piece, so tapping the banner on
 *                 the home page opens that product. Optional, and
 *                 cleared the same way it is set — most slides link
 *                 nowhere and are none the worse for it.
 *   Replace       swaps the artwork and keeps the slide's place in the
 *                 order — which is the only thing it does that deleting
 *                 and re-uploading would not, since a new upload lands
 *                 at the end.
 *   Delete        destroys the row and the file on Cloudinary. Behind a
 *                 confirmation, and never the first thing offered.
 *
 * The order the tiles are listed in is the order the slides rotate,
 * which is why the arrows are here and why a reorder sends the whole
 * set: a partial one would leave two banners sharing a position and the
 * carousel settling somewhere nobody chose.
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
  Replace,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MediaFrame } from "@/components/admin/MediaFrame";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  Field,
  Input,
  Modal,
  Select,
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
  deleteBanner,
  listBanners,
  rejectionReason,
  reorderBanners,
  replaceBannerImage,
  setBannerActive,
  setBannerProduct,
} from "@/lib/api/banners";
import { listAllProducts } from "@/lib/api/products";

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
  const [deleting, setDeleting] = useState(null);

  // Which slide's link is being edited, and the catalogue to pick from.
  const [linking, setLinking] = useState(null);
  // Its own request rather than something the banners bring with them —
  // the carousel is twelve rows and the catalogue is two hundred, and a
  // screen that mostly reorders pictures should not wait on the second
  // to show the first. A failure here costs the picker and nothing else,
  // which is why it is not folded into `state`.
  const [products, setProducts] = useState([]);

  // Which slide the replace picker is about to overwrite. One piece of
  // state and one input, rather than an input per tile: "replacing" and
  // "which" are never separately true.
  const [replacingId, setReplacingId] = useState(null);

  const addRef = useRef(null);
  const replaceRef = useRef(null);

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

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    listAllProducts({ signal: controller.signal })
      .then((rows) => {
        if (active) setProducts(rows);
      })
      .catch(() => {
        // Swallowed deliberately. Every other gesture on this screen
        // still works without the catalogue, and the link editor says so
        // itself rather than putting an error banner over the artwork.
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

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

  async function replace(fileList) {
    const file = Array.from(fileList ?? [])[0];
    const id = replacingId;

    setReplacingId(null);

    if (!file || !id) return;

    const rejected = rejectionReason(file);

    if (rejected) {
      toast.error(rejected);
      return;
    }

    setBusyId(id);

    try {
      const saved = await replaceBannerImage(id, file);

      setState((current) => ({
        ...current,
        banners: current.banners.map((row) => (row.id === saved.id ? saved : row)),
      }));

      toast.success("Banner replaced", "It kept its place in the rotation.");
    } catch (error) {
      toast.error("Could not replace that banner", error?.message);
    } finally {
      setBusyId(null);
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
   * Points a slide at a piece, or takes the link off it.
   *
   * `productId` of "" is the cleared case and is a real edit, not a
   * no-op — the API takes it as null and the banner goes back to being
   * a photograph that does nothing when tapped.
   */
  async function saveLink(banner, productId) {
    setBusyId(banner.id);

    try {
      const saved = await setBannerProduct(banner.id, productId);

      setState((current) => ({
        ...current,
        banners: current.banners.map((row) => (row.id === saved.id ? saved : row)),
      }));

      setLinking(null);

      toast.success(
        saved.productId ? "Banner linked" : "Link removed",
        saved.productId
          ? `Tapping this slide now opens ${saved.productName}.`
          : "This slide is a photograph again — tapping it does nothing.",
      );
    } catch (error) {
      toast.error("Could not change the link", error?.message);
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

  async function confirmDelete() {
    const banner = deleting;

    setBusyId(banner.id);

    try {
      const remaining = await deleteBanner(banner.id);

      setState({ status: "ready", banners: remaining, error: null });
      setDeleting(null);
      toast.success("Banner deleted", "The artwork was removed from storage too.");
    } catch (error) {
      toast.error("Could not delete that", error?.message);
    } finally {
      setBusyId(null);
    }
  }

  // --- render ---------------------------------------------------------------

  const shown = state.banners.filter((banner) => banner.active).length;
  const locked = busy || Boolean(busyId);

  return (
    <div className="space-y-4">
      {/* One input for adding, one for replacing. Both are off-screen and
          driven by the buttons; a visible file input cannot be styled to
          match anything else on this screen. */}
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
      <input
        ref={replaceRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        onChange={(e) => {
          replace(e.target.files);
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
                  onLink={() => setLinking(banner)}
                  onReplace={() => {
                    setReplacingId(banner.id);
                    replaceRef.current?.click();
                  }}
                  onDelete={() => setDeleting(banner)}
                />
              ))}
            </ul>

            <p className="mt-3 text-[11px] text-ink-500">
              JPEG, PNG or WebP · up to 5 MB each · {MAX_PER_UPLOAD} at a time.
              Slides are shown at 16:9. Artwork of any other shape is fitted
              inside that frame against a blurred copy of itself rather than
              cropped, so nothing is cut off — design at 16:9 for the sharpest
              result. A slide linked to a piece shows that piece&rsquo;s name in
              the corner of the banner, so leave that corner clear when the
              artwork is going to carry a link.
            </p>
          </div>
        ) : null}
      </Card>

      {/* ----------------------------------------------------------
          LINK
          ---------------------------------------------------------- */}

      {/* Keyed on the banner, so opening a different slide is a remount
          and the form seeds itself from that row rather than needing an
          effect to chase the prop. Same treatment as the story editor. */}
      {linking ? (
        <LinkEditor
          key={linking.id}
          banner={linking}
          products={products}
          saving={busyId === linking.id}
          onClose={() => setLinking(null)}
          onSave={(productId) => saveLink(linking, productId)}
        />
      ) : null}

      {/* ----------------------------------------------------------
          DELETE
          ---------------------------------------------------------- */}

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        size="sm"
        title="Delete this banner?"
        description="The artwork is removed from the carousel and from storage. This cannot be undone."
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
        {deleting ? (
          <div className="flex items-center gap-3">
            <MediaFrame
              src={deleting.image}
              ratio="aspect-16/9"
              className="w-32 shrink-0 rounded-lg"
            />
            <p className="text-xs leading-relaxed text-ink-600">
              Deleting is permanent — putting this banner back means uploading the
              file again. To take it out of the rotation without losing it, close
              this and use the shown toggle instead.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/**
 * Where one slide points.
 *
 * A modal of its own rather than a select on the tile, because the
 * catalogue is two hundred pieces and choosing from it needs a search
 * box — and because putting one next to the artwork on every tile would
 * make a screen about pictures look like a screen about forms.
 *
 * The picture is in the dialog beside the picker for the same reason the
 * tiles are pictures: "which banner is this" is answered by looking at
 * it, not by reading a row number.
 */
function LinkEditor({ banner, products, saving, onClose, onSave }) {
  const [productId, setProductId] = useState(banner.productId ?? "");
  const [search, setSearch] = useState("");

  // Two hundred products in one dropdown is a scroll, not a choice. The
  // filter narrows it; the cap keeps the list renderable when the filter
  // is empty. Same treatment as the stories and reviews screens.
  const options = useMemo(() => {
    const term = search.trim().toLowerCase();

    const matches = term
      ? products.filter((product) =>
          `${product.name} ${product.slug ?? ""}`.toLowerCase().includes(term),
        )
      : products;

    return matches.slice(0, 50);
  }, [products, search]);

  // The slide may already point at a piece that is not in `options` —
  // because it is off sale, or simply past the cap above. Without this
  // the Select would quietly show "no piece" and saving would clear a
  // link the shop never touched.
  const stranded = productId && !options.some((product) => product.id === productId);

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      size="sm"
      title="Where does this slide go?"
      description="Optional. With a piece chosen, tapping this banner on the home page opens it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" busy={saving} onClick={() => onSave(productId)}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <MediaFrame
          src={banner.image}
          ratio="aspect-16/9"
          className="w-full rounded-lg"
        />

        <Field
          label="Piece"
          hint={
            products.length === 0
              ? "The catalogue could not be loaded — reload the page to link this slide to a piece."
              : "Leave this on “No piece” for a banner that is just a photograph. Type to narrow the list."
          }
        >
          <div className="space-y-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products by name"
            />
            <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">No piece</option>
              {stranded ? (
                <option value={productId}>
                  {banner.productName || "The piece this slide names"}
                  {banner.productActive === false ? " (off sale)" : ""}
                </option>
              ) : null}
              {options.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </Select>
          </div>
        </Field>

        {banner.productActive === false ? (
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
            The piece this slide names is off sale, so the banner is showing on
            the home page but is not linking anywhere. Point it at something on
            sale, or clear the link — the artwork stays either way.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/**
 * One slide, shown as the artwork it is.
 *
 * The tile is the photograph rather than a filename and a date, because
 * that is what the shop is actually checking when it opens this screen:
 * which pictures are running, and in what order.
 */
function BannerTile({
  banner,
  index,
  total,
  busy,
  disabled,
  onMove,
  onToggle,
  onLink,
  onReplace,
  onDelete,
}) {
  const locked = disabled || busy;

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
      <div className="relative">
        {/* 16:9, matching the frame on the home page exactly — this tile is
            what the shop judges a banner by, so it has to crop and fill
            the way the real carousel does. */}
        <MediaFrame src={banner.image} ratio="aspect-16/9" />

        <span className="absolute top-1.5 left-1.5">
          <Badge tone={banner.active ? "brand" : "amber"}>
            {banner.active ? `Slide ${index + 1}` : "Hidden"}
          </Badge>
        </span>
      </div>

      <div className="space-y-1.5 border-t border-ink-200 p-2">
        <span
          className="flex items-center gap-1.5 text-ink-500"
          title={banner.active ? "In the rotation" : "Out of the rotation"}
        >
          {banner.active ? (
            <Eye className="size-3.5" aria-hidden="true" />
          ) : (
            <EyeOff className="size-3.5" aria-hidden="true" />
          )}
          <Toggle
            size="sm"
            checked={banner.active}
            disabled={locked}
            onChange={onToggle}
            label={`Show banner ${index + 1} on the home page`}
          />
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

        <div className="flex items-center justify-between">
          <span className="flex items-center">
            <Button
              size="sm"
              variant="ghost"
              disabled={locked || index === 0}
              aria-label={`Move banner ${index + 1} earlier`}
              onClick={() => onMove(-1)}
            >
              <ArrowLeft className="size-3.5 text-ink-400" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={locked || index === total - 1}
              aria-label={`Move banner ${index + 1} later`}
              onClick={() => onMove(1)}
            >
              <ArrowRight className="size-3.5 text-ink-400" aria-hidden="true" />
            </Button>
          </span>

          <span className="flex items-center">
            <Button
              size="sm"
              variant="ghost"
              disabled={locked}
              title="Choose the piece this slide links to"
              aria-label={`Choose the piece banner ${index + 1} links to`}
              onClick={onLink}
            >
              <Link2
                className={cx(
                  "size-3.5",
                  banner.productId && !stale ? "text-brand-600" : "text-ink-400",
                )}
                aria-hidden="true"
              />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={locked}
              title="Replace this artwork, keeping its place"
              aria-label={`Replace the artwork on banner ${index + 1}`}
              onClick={onReplace}
            >
              <Replace className="size-3.5 text-ink-400" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={locked}
              aria-label={`Delete banner ${index + 1}`}
              onClick={onDelete}
            >
              <Trash2 className="size-3.5 text-ink-400" aria-hidden="true" />
            </Button>
          </span>
        </div>
      </div>
    </li>
  );
}
