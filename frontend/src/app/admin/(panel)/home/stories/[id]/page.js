"use client";

/**
 * One customer story (F-06.08), on a screen of its own.
 *
 * The wall next door is for judging the set — which photographs are up,
 * in what order. What is *printed* on a card, and everything that cannot
 * be undone, happens here: the quote, the name, the piece it names,
 * swapping the photograph, deleting it.
 *
 * This screen replaced a dialog, and that was the point. A story is a
 * photograph with words over the bottom of it, so the editor has to show
 * the photograph while the words are being typed — a box floating over
 * the wall could only ever show a thumbnail of the thing being edited,
 * and it covered the rest of the wall to do it. Nothing here opens over
 * anything: delete asks in place, under the picture it will destroy.
 *
 * Every control carries its own words. A pencil, a pair of arrows and a
 * bin on a tile the size of a stamp were four guesses about what would
 * happen to a live page, which is what this screen exists to end.
 */

import {
  ArrowLeft,
  ArrowRight,
  ImageOff,
  Replace,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ImageGuide, ImageGuideButton, STORY_GUIDE } from "@/components/admin/ImageGuide";
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
  Textarea,
  Toggle,
  useToast,
} from "@/components/admin/ui";
import {
  ACCEPT_ATTRIBUTE,
  MAX_BODY_LENGTH,
  MAX_NAME_LENGTH,
  deleteStory,
  listStories,
  rejectionReason,
  reorderStories,
  replaceStoryImage,
  setStoryPublished,
  updateStory,
} from "@/lib/api/customerStories";
import { listAllProducts } from "@/lib/api/products";

const BACK = "/admin/home/stories";

export default function StoryDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();

  const [state, setState] = useState({
    status: "loading",
    stories: [],
    error: null,
  });
  const [reload, setReload] = useState(0);

  const [products, setProducts] = useState([]);

  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const replaceRef = useRef(null);

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

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    listAllProducts({ signal: controller.signal })
      .then((rows) => {
        if (active) setProducts(rows);
      })
      .catch(() => {
        // Swallowed on purpose — the picker says so in its own hint.
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  const index = state.stories.findIndex((row) => row.id === id);
  const story = index === -1 ? null : state.stories[index];

  // --- writes ---------------------------------------------------------------

  function patch(saved) {
    setState((current) => ({
      ...current,
      stories: current.stories.map((row) => (row.id === saved.id ? saved : row)),
    }));
  }

  async function togglePublished() {
    setBusy(true);

    try {
      patch(await setStoryPublished(story.id, !story.published));

      toast.info(
        story.published ? "Story hidden" : "Story published",
        story.published
          ? "It is off the home page, and kept."
          : "It is on the home page.",
      );
    } catch (error) {
      toast.error("Could not change that", error?.message);
    } finally {
      setBusy(false);
    }
  }

  async function move(delta) {
    const target = index + delta;
    if (target < 0 || target >= state.stories.length) return;

    const next = [...state.stories];
    [next[index], next[target]] = [next[target], next[index]];

    setBusy(true);
    setState((current) => ({ ...current, stories: next }));

    try {
      const saved = await reorderStories(next.map((row) => row.id));

      setState({ status: "ready", stories: saved, error: null });
      toast.success(`Now card ${target + 1} of ${saved.length}`);
    } catch (error) {
      toast.error("Could not reorder the stories", error?.message);
      refresh();
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
      patch(await replaceStoryImage(story.id, file));

      toast.success("Photograph updated", "The card kept its place.");
    } catch (error) {
      toast.error("Could not update the photograph", error?.message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Saves the three typed fields.
   *
   * Answers with the field errors the API named, so the section below can
   * put each one under the box it belongs to rather than in a toast that
   * says something went wrong somewhere.
   */
  async function save(form) {
    try {
      patch(await updateStory(story.id, form));

      toast.success("Story updated");
      return {};
    } catch (error) {
      toast.error("Could not save the story", error?.message);
      return error?.fields ?? {};
    }
  }

  async function destroy() {
    setBusy(true);

    try {
      await deleteStory(story.id);

      toast.success(
        "Story deleted",
        story.image ? "The photograph was removed from storage too." : undefined,
      );
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
          Back to customer stories
        </LinkButton>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="p-8">
          <EmptyState
            icon={<ImageOff aria-hidden="true" />}
            title="Story not found"
            description="This card is no longer in the list — it may have been deleted from another screen."
            action={
              <LinkButton href={BACK}>
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                Back to customer stories
              </LinkButton>
            }
          />
        </Card>
      </div>
    );
  }

  const total = state.stories.length;

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
          Customer stories
        </LinkButton>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-ink-700">
          {story.customerName || `Card ${index + 1}`}
        </span>
      </nav>

      {/* ----------------------------------------------------------
          THE PHOTOGRAPH
          ---------------------------------------------------------- */}

      <Card>
        <CardHeader
          title="The photograph"
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
                Replace photograph
              </Button>
            </>
          }
        />

        <ImageGuide
          guide={STORY_GUIDE}
          open={guideOpen}
          onClose={() => setGuideOpen(false)}
        />

        <div className="p-4 pt-0">
          <MediaFrame
            src={story.image}
            ratio="aspect-9/16"
            className="w-56 rounded-lg ring-1 ring-ink-200"
          />
          <p className="mt-2 text-[11px] text-ink-500">
            Every story is a photograph — it can be swapped, but not removed. A
            replacement keeps the card where it is in the wall.
          </p>
        </div>
      </Card>

      {/* ----------------------------------------------------------
          ON THE HOME PAGE
          ---------------------------------------------------------- */}

      <Card>
        <CardHeader
          title="On the home page"
          description="Whether this card is published, and where in the wall it sits."
        />

        <div className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-ink-800">
                {story.published ? "Published" : "Hidden"}
                <Badge tone={story.published ? "brand" : "amber"}>
                  {story.published ? `Card ${index + 1} of ${total}` : "Not shown"}
                </Badge>
              </p>
              <p className="mt-1 text-xs text-ink-500">
                {story.published
                  ? "Visitors are seeing this card in the customer section of the home page."
                  : "This card is off the home page and kept — the photograph is not deleted."}
              </p>
            </div>

            <Toggle
              checked={story.published}
              disabled={busy}
              onChange={togglePublished}
              label="Publish this story on the home page"
            />
          </div>

          <div className="border-t border-ink-200/80 pt-4">
            <p className="text-sm font-medium text-ink-800">
              Position {index + 1} of {total}
            </p>
            <p className="mt-1 text-xs text-ink-500">
              The home page shows the first 24 cards in this order.
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" disabled={busy || index === 0} onClick={() => move(-1)}>
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
          WHAT IS PRINTED ON THE CARD
          ---------------------------------------------------------- */}

      {/* Keyed on the story, so the boxes seed themselves from this row
          rather than needing an effect to chase a prop — and so a save,
          which replaces the row object, leaves what is typed alone. */}
      <PrintedOnTheCard
        key={story.id}
        story={story}
        products={products}
        onSave={save}
      />

      {/* ----------------------------------------------------------
          DELETE — asked in place, never over the picture
          ---------------------------------------------------------- */}

      <Card className="ring-red-200">
        <CardHeader
          title="Delete this story"
          description="The card is removed from the home page, and the photograph is deleted from storage. This cannot be undone."
        />

        <div className="p-4">
          {confirming ? (
            <div className="rounded-lg bg-red-50 p-3 ring-1 ring-inset ring-red-200">
              <p className="text-xs leading-relaxed text-red-800">
                A customer&rsquo;s photograph cannot be asked for twice. To take the
                card off the home page without losing it, use the toggle above
                instead.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="danger" busy={busy} onClick={destroy}>
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Yes, delete this story
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
              Delete this story
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

/**
 * The three typed fields, beside the photograph rather than over it.
 *
 * Its own component so the boxes can be seeded from the story exactly
 * once, in a `useState` initialiser: the parent keys it on the story's
 * id, which makes "open a different card" a remount and a save — which
 * replaces the row object — a no-op for what is in the boxes.
 *
 * Every field may be left empty. A card stripped back to its photograph
 * is still a card, which is why nothing here is required and why the
 * save button is dark until something has actually changed.
 */
function PrintedOnTheCard({ story, products, onSave }) {
  const [form, setForm] = useState({
    customerName: story.customerName ?? "",
    body: story.body ?? "",
    productId: story.productId ?? "",
  });
  const [search, setSearch] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Two hundred products in one dropdown is a scroll, not a choice. The
  // filter narrows it; the cap keeps the list renderable when the filter
  // is empty. Same treatment as the carousel and reviews screens.
  const options = useMemo(() => {
    const term = search.trim().toLowerCase();

    const matches = term
      ? products.filter((product) =>
          `${product.name} ${product.slug ?? ""}`.toLowerCase().includes(term),
        )
      : products;

    return matches.slice(0, 50);
  }, [products, search]);

  // The card may already name a piece that is not in `options` — because
  // it is off sale, or simply past the cap above. Without this the Select
  // would quietly show "no piece" and saving would clear a link nobody
  // touched.
  const stranded =
    form.productId && !options.some((product) => product.id === form.productId);

  const dirty =
    form.customerName !== (story.customerName ?? "") ||
    form.body !== (story.body ?? "") ||
    form.productId !== (story.productId ?? "");

  async function submit() {
    const errors = {};

    if (form.customerName.trim().length > MAX_NAME_LENGTH) {
      errors.customerName = `A name must not exceed ${MAX_NAME_LENGTH} characters`;
    }

    if (form.body.trim().length > MAX_BODY_LENGTH) {
      errors.body = `A quote must not exceed ${MAX_BODY_LENGTH} characters`;
    }

    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    setFieldErrors({});

    try {
      setFieldErrors(await onSave(form));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="What is printed on the card"
        description="All three are optional — a card stripped back to its photograph is still a card."
      />

      <div className="space-y-4 p-4">
        <Field
          label="Quote"
          error={fieldErrors.body}
          hint="Publish the part worth reading rather than the whole message. Left blank, the card is the photograph alone."
        >
          <Textarea
            rows={4}
            value={form.body}
            invalid={Boolean(fieldErrors.body)}
            maxLength={MAX_BODY_LENGTH}
            placeholder="The dhabu cotton is even softer than it looks…"
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          />
        </Field>

        <Field
          label="Name"
          error={fieldErrors.customerName}
          hint="As the shop wants it printed — “Meera K.”, “A customer from Erode”. Left blank, the card shows no name at all."
        >
          <Input
            value={form.customerName}
            invalid={Boolean(fieldErrors.customerName)}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Meera K."
            onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
          />
        </Field>

        <Field
          label="Piece"
          error={fieldErrors.productId}
          hint={
            products.length === 0
              ? "The catalogue could not be loaded — reload the page to link this card to a piece."
              : "With one chosen, the card links through to that piece. Type to narrow the list."
          }
        >
          <div className="space-y-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products by name"
            />
            <Select
              value={form.productId}
              invalid={Boolean(fieldErrors.productId)}
              onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}
            >
              <option value="">No piece</option>
              {stranded ? (
                <option value={form.productId}>
                  {story.productName || "The piece this card names"}
                  {story.productActive === false ? " (off sale)" : ""}
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

        {story.productId && story.productActive === false ? (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {story.productName || "The piece this card names"} is off sale, so the
              card is showing on the home page but is not linking anywhere. Point it
              at something on sale, or choose “No piece”.
            </span>
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" busy={saving} disabled={!dirty} onClick={submit}>
            Save what is printed
          </Button>
          {dirty ? (
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() =>
                setForm({
                  customerName: story.customerName ?? "",
                  body: story.body ?? "",
                  productId: story.productId ?? "",
                })
              }
            >
              Undo my changes
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
