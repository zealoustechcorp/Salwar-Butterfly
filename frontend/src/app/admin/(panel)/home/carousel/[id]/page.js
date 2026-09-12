"use client";

/**
 * One slide of the home page carousel (F-06), on a screen of its own.
 *
 * The grid next door is for judging the set — which artwork is running,
 * in what order. Everything that needs a sentence to explain happens
 * here instead: where the slide points, swapping the artwork, taking it
 * out of the rotation, deleting it. Each of those was an icon on a tile
 * before, and an icon is a guess: a chain link, a pair of arrows and a
 * bin say nothing about what they will do to a customer-facing page.
 * Here every control carries its own words and the consequence under it.
 *
 * Nothing on this screen is a dialog. The artwork is the thing being
 * decided about, so covering it to ask a question is exactly backwards —
 * delete asks in place, underneath the picture it is about to destroy.
 *
 * There is no "get one banner" endpoint, and there does not need to be:
 * the carousel is at most MAX_BANNERS rows, the list is one request, and
 * having the whole set in hand is what makes "Slide 3 of 7" and the
 * reorder buttons possible on a screen about a single slide.
 */

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ImageOff,
  Replace,
  Trash2,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BANNER_GUIDE, ImageGuide, ImageGuideButton } from "@/components/admin/ImageGuide";
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
  LinkButton,
  Select,
  SkeletonRows,
  Toggle,
  cx,
  useToast,
} from "@/components/admin/ui";
import {
  ACCEPT_ATTRIBUTE,
  deleteBanner,
  listBanners,
  rejectionReason,
  reorderBanners,
  replaceBannerImage,
  setBannerActive,
  setBannerProduct,
} from "@/lib/api/banners";
import { listAllProducts } from "@/lib/api/products";

const BACK = "/admin/home/carousel";

export default function BannerDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();

  const [state, setState] = useState({
    status: "loading",
    banners: [],
    error: null,
  });
  const [reload, setReload] = useState(0);

  // The catalogue, for the link picker. Its own request and its own
  // silent failure: without it the shop loses the ability to point this
  // slide at a piece, and nothing else on the screen.
  const [products, setProducts] = useState([]);

  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const replaceRef = useRef(null);

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
        // Swallowed on purpose — the picker says so in its own hint
        // rather than putting an error over a screen that otherwise
        // works.
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  const index = state.banners.findIndex((row) => row.id === id);
  const banner = index === -1 ? null : state.banners[index];

  // --- writes ---------------------------------------------------------------

  function patch(saved) {
    setState((current) => ({
      ...current,
      banners: current.banners.map((row) => (row.id === saved.id ? saved : row)),
    }));
  }

  async function toggleShown() {
    setBusy(true);

    try {
      patch(await setBannerActive(banner.id, !banner.active));

      toast.info(
        banner.active ? "Banner hidden" : "Banner shown",
        banner.active
          ? "It is out of the rotation, and kept."
          : "It is back in the rotation on the home page.",
      );
    } catch (error) {
      toast.error("Could not change that", error?.message);
    } finally {
      setBusy(false);
    }
  }

  async function move(delta) {
    const target = index + delta;
    if (target < 0 || target >= state.banners.length) return;

    const next = [...state.banners];
    [next[index], next[target]] = [next[target], next[index]];

    setBusy(true);
    setState((current) => ({ ...current, banners: next }));

    try {
      const saved = await reorderBanners(next.map((row) => row.id));

      setState({ status: "ready", banners: saved, error: null });
      toast.success(`Now slide ${target + 1} of ${saved.length}`);
    } catch (error) {
      toast.error("Could not reorder the carousel", error?.message);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveLink(nextId) {
    setBusy(true);

    try {
      const saved = await setBannerProduct(banner.id, nextId);

      patch(saved);

      toast.success(
        saved.productId ? "Banner linked" : "Link removed",
        saved.productId
          ? `Tapping this slide now opens ${saved.productName}.`
          : "This slide is a photograph again — tapping it does nothing.",
      );
    } catch (error) {
      toast.error("Could not change the link", error?.message);
    } finally {
      setBusy(false);
    }
  }

  async function replace(fileList) {
    const file = Array.from(fileList ?? [])[0];
    if (!file) return;

    const rejected = rejectionReason(file);

    if (rejected) {
      toast.error(rejected);
      return;
    }

    setBusy(true);

    try {
      patch(await replaceBannerImage(banner.id, file));

      toast.success("Artwork replaced", "The slide kept its place in the rotation.");
    } catch (error) {
      toast.error("Could not replace that artwork", error?.message);
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    setBusy(true);

    try {
      await deleteBanner(banner.id);

      toast.success("Banner deleted", "The artwork was removed from storage too.");
      router.push(BACK);
    } catch (error) {
      toast.error("Could not delete that", error?.message);
      setBusy(false);
    }
  }

  // --- render ---------------------------------------------------------------

  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <SkeletonRows rows={4} />
        </Card>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <ErrorNotice error={state.error} onRetry={refresh} />
        <LinkButton href={BACK}>
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to the carousel
        </LinkButton>
      </div>
    );
  }

  if (!banner) {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="p-8">
          <EmptyState
            icon={<ImageOff aria-hidden="true" />}
            title="Banner not found"
            description="This slide is no longer in the carousel — it may have been deleted from another screen."
            action={
              <LinkButton href={BACK}>
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                Back to the carousel
              </LinkButton>
            }
          />
        </Card>
      </div>
    );
  }

  const stale = Boolean(banner.productId) && banner.productActive === false;
  const total = state.banners.length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
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

      <nav className="flex items-center gap-1.5 text-xs text-ink-500">
        <LinkButton variant="ghost" size="sm" href={BACK}>
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Carousel
        </LinkButton>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-ink-700">
          {banner.active ? `Slide ${index + 1}` : "Hidden slide"}
        </span>
      </nav>

      {/* ----------------------------------------------------------
          THE ARTWORK
          ---------------------------------------------------------- */}

      <Card>
        <CardHeader
          title="The artwork"
          description="Shown here exactly as the home page crops it."
          actions={
            <>
              <ImageGuideButton onOpen={() => setGuideOpen(true)} />
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => replaceRef.current?.click()}
              >
                <Replace className="size-3.5" aria-hidden="true" />
                Replace artwork
              </Button>
            </>
          }
        />

        <ImageGuide
          guide={BANNER_GUIDE}
          open={guideOpen}
          onClose={() => setGuideOpen(false)}
        />

        <div className="p-4 pt-0">
          <MediaFrame
            src={banner.image}
            ratio="aspect-16/9"
            className="w-full rounded-lg ring-1 ring-ink-200"
          />
          <p className="mt-2 text-[11px] text-ink-500">
            Replacing the artwork keeps this slide where it is in the rotation —
            which is the one thing deleting it and uploading a new file would not
            do, since a new upload lands at the end.
          </p>
        </div>
      </Card>

      {/* ----------------------------------------------------------
          ON THE HOME PAGE
          ---------------------------------------------------------- */}

      <Card>
        <CardHeader
          title="On the home page"
          description="Whether this slide is in the rotation, and where in it."
        />

        <div className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-ink-800">
                {banner.active ? "Shown in the rotation" : "Hidden"}
                <Badge tone={banner.active ? "brand" : "amber"}>
                  {banner.active ? `Slide ${index + 1} of ${total}` : "Not shown"}
                </Badge>
              </p>
              <p className="mt-1 text-xs text-ink-500">
                {banner.active
                  ? "Visitors are seeing this banner slide past in the first fold of the home page."
                  : "This banner is off the home page and kept — a seasonal one pulled in November is worth having back next October."}
              </p>
            </div>

            <Toggle
              checked={banner.active}
              disabled={busy}
              onChange={toggleShown}
              label="Show this banner on the home page"
            />
          </div>

          <div className="border-t border-ink-200/80 pt-4">
            <p className="text-sm font-medium text-ink-800">
              Position {index + 1} of {total}
            </p>
            <p className="mt-1 text-xs text-ink-500">
              The order the slides rotate in on the home page.
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy || index === 0}
                onClick={() => move(-1)}
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                Move earlier
              </Button>
              <Button
                size="sm"
                disabled={busy || index === total - 1}
                onClick={() => move(1)}
              >
                Move later
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* ----------------------------------------------------------
          WHERE THE SLIDE GOES
          ---------------------------------------------------------- */}

      {/* Keyed on the banner, so the picker seeds itself from this row
          rather than needing an effect to chase a prop — and so a save,
          which replaces the row object, leaves the choice alone. */}
      <LinkSection
        key={banner.id}
        banner={banner}
        products={products}
        busy={busy}
        stale={stale}
        onSave={saveLink}
      />

      {/* ----------------------------------------------------------
          DELETE — asked in place, never over the picture
          ---------------------------------------------------------- */}

      <Card className="ring-red-200">
        <CardHeader
          title="Delete this banner"
          description="The artwork is removed from the carousel and from storage. This cannot be undone."
        />

        <div className="p-4">
          {confirming ? (
            <div className="rounded-lg bg-red-50 p-3 ring-1 ring-inset ring-red-200">
              <p className="text-xs leading-relaxed text-red-800">
                Deleting is permanent — putting this banner back means uploading the
                file again. To take it out of the rotation without losing it, use the
                toggle above instead.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="danger" busy={busy} onClick={destroy}>
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Yes, delete this banner
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" disabled={busy} onClick={() => setConfirming(true)}>
              <Trash2 className="size-3.5" aria-hidden="true" />
              Delete this banner
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

/**
 * Where this slide points.
 *
 * Its own component because the choice has to be seeded from the banner
 * exactly once: the parent keys it on the banner's id, so a save — which
 * replaces the row object — is not a reason to reset the picker, and the
 * seeding happens in a `useState` initialiser rather than in an effect
 * chasing a prop.
 */
function LinkSection({ banner, products, busy, stale, onSave }) {
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
  // link nobody touched.
  const stranded = productId && !options.some((product) => product.id === productId);

  return (
    <Card>
      <CardHeader
        title="Where this slide goes"
        description="Optional. With a piece chosen, tapping this banner on the home page opens that piece."
      />

      <div className="space-y-4 p-4">
        <p
          className={cx(
            "flex items-center gap-1.5 text-xs",
            stale ? "text-amber-700" : "text-ink-500",
          )}
        >
          {stale ? (
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
          ) : null}
          <span>
            {!banner.productId
              ? "Right now this banner links nowhere — tapping it does nothing."
              : stale
                ? `${banner.productName || "The piece this slide names"} is off sale, so the banner shows but does not link.`
                : `Right now this banner opens ${banner.productName}.`}
          </span>
        </p>

        <Field
          label="Piece"
          hint={
            products.length === 0
              ? "The catalogue could not be loaded — reload the page to link this slide to a piece."
              : "Type to narrow the list, then save. Leave it on “No piece” for a banner that is just a photograph."
          }
        >
          <div className="space-y-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products by name"
            />
            <Select
              value={productId}
              disabled={busy}
              onChange={(e) => setProductId(e.target.value)}
            >
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

        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={busy || productId === (banner.productId ?? "")}
            onClick={() => onSave(productId)}
          >
            Save where this slide goes
          </Button>
          {banner.productId ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setProductId("");
                onSave("");
              }}
            >
              Remove the link
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
