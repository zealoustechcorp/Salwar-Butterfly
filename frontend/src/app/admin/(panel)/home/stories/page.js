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
 * Three gestures per card, softest first: the published toggle takes a
 * story off the home page and keeps it, Edit changes what is printed,
 * and Delete destroys the row and the photograph with it. That last one
 * is behind a confirmation and is never the first thing offered — a
 * customer's photograph is not something the shop can ask for twice.
 */

import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  MessageSquareQuote,
  Pencil,
  RefreshCw,
  Replace,
  Trash2,
  TriangleAlert,
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
  Textarea,
  Toggle,
  cx,
  useToast,
} from "@/components/admin/ui";
import {
  ACCEPT_ATTRIBUTE,
  MAX_BODY_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PER_UPLOAD,
  MAX_STORIES,
  createStoriesFromImages,
  deleteStory,
  listStories,
  rejectionReason,
  reorderStories,
  replaceStoryImage,
  setStoryPublished,
  updateStory,
} from "@/lib/api/customerStories";
import { listAllProducts } from "@/lib/api/products";

export default function CustomerStoriesPage() {
  const toast = useToast();

  const [state, setState] = useState({
    status: "loading",
    stories: [],
    error: null,
  });
  const [reload, setReload] = useState(0);

  // The catalogue, for the product picker in the editor. Its own request
  // and its own failure: a catalogue that will not load costs the shop
  // the ability to link a card to a piece, and nothing else on the
  // screen, so it must not take the list of stories down with it.
  const [products, setProducts] = useState([]);

  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // The story being edited, or BLANK for a new typed quote, or null when
  // the editor is closed. One piece of state rather than two booleans:
  // "editing" and "which" are never separately true.
  const [editing, setEditing] = useState(null);

  const [replacingId, setReplacingId] = useState(null);

  const addRef = useRef(null);
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
        // Swallowed on purpose — the editor says so in its own hint
        // rather than putting an error over a screen that otherwise
        // works.
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

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
      const saved = await replaceStoryImage(id, file);

      setState((current) => ({
        ...current,
        stories: current.stories.map((row) => (row.id === saved.id ? saved : row)),
      }));

      toast.success("Photograph updated", "The card kept its place.");
    } catch (error) {
      toast.error("Could not update the photograph", error?.message);
    } finally {
      setBusyId(null);
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

  async function confirmDelete() {
    const story = deleting;

    setBusyId(story.id);

    try {
      const remaining = await deleteStory(story.id);

      setState({ status: "ready", stories: remaining, error: null });
      setDeleting(null);
      toast.success(
        "Story deleted",
        story.image ? "The photograph was removed from storage too." : undefined,
      );
    } catch (error) {
      toast.error("Could not delete that", error?.message);
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
                  onEdit={() => setEditing(story)}
                  onReplace={() => {
                    setReplacingId(story.id);
                    replaceRef.current?.click();
                  }}
                  onDelete={() => setDeleting(story)}
                />
              ))}
            </ul>

            <p className="mt-3 text-[11px] text-ink-500">
              JPEG, PNG or WebP · up to 5 MB each · {MAX_PER_UPLOAD} at a time. The
              home page shows the first 24 in this order, each in a 9:16 card. A
              photograph of any other shape is fitted inside that card against a
              blurred copy of itself rather than cropped, so nothing is cut off.
            </p>
          </div>
        ) : null}
      </Card>

      {/* Keyed on the story, so opening a different card builds a fresh
          form rather than reconciling one that is mid-edit — and so a
          list refresh underneath the modal, which keeps the same key,
          leaves what is being typed alone. */}
      <StoryEditor
        key={editing?.id ?? "new"}
        story={editing}
        products={products}
        onClose={() => setEditing(null)}
        onSaved={({ stories, story, message }) => {
          setState((current) => ({
            status: "ready",
            error: null,
            // A create answers with the whole list, because inserting at
            // the front renumbers everything behind it. An edit answers
            // with the one row it changed, so the list is patched.
            stories:
              stories ??
              current.stories.map((row) => (row.id === story.id ? story : row)),
          }));
          setEditing(null);
          toast.success(message);
        }}
      />

      {/* ----------------------------------------------------------
          DELETE
          ---------------------------------------------------------- */}

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        size="sm"
        title="Delete this story?"
        description={
          deleting?.image
            ? "The card is removed from the home page, and the photograph is deleted from storage. This cannot be undone."
            : "The card is removed from the home page. This cannot be undone."
        }
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
          <div className="flex items-start gap-3">
            <MediaFrame
              src={deleting.image}
              ratio="aspect-9/16"
              className="w-20 shrink-0 rounded-lg"
            />
            <div className="text-xs leading-relaxed text-ink-600">
              {deleting.body ? (
                <p className="text-ink-800">&ldquo;{deleting.body}&rdquo;</p>
              ) : null}
              {deleting.customerName ? (
                <p className="mt-1 font-medium text-ink-800">
                  {deleting.customerName}
                </p>
              ) : null}
              <p className="mt-2">
                {deleting.image
                  ? "A customer's photograph cannot be asked for twice. To take the card off the home page without losing it, close this and use the published toggle instead."
                  : "To take the card off the home page without losing it, close this and use the published toggle instead."}
              </p>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

// ============================================================
// ONE CARD
// ============================================================

function StoryTile({
  story,
  index,
  total,
  busy,
  disabled,
  onMove,
  onToggle,
  onEdit,
  onReplace,
  onDelete,
}) {
  const locked = disabled || busy;

  return (
    <li
      className={cx(
        "flex flex-col overflow-hidden rounded-lg ring-1 ring-ink-200",
        story.published ? undefined : "opacity-75",
      )}
    >
      <div className="relative shrink-0">
        {/* 9:16, matching the card on the home page exactly — this tile is
            what the shop judges a photograph by, so it has to fit and fill
            the way the real rail does. */}
        <MediaFrame src={story.image} ratio="aspect-9/16" />

        <span className="absolute top-1.5 left-1.5">
          <Badge tone={story.published ? "brand" : "amber"}>
            {story.published ? `#${index + 1}` : "Hidden"}
          </Badge>
        </span>
      </div>

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

        <span
          className="flex items-center gap-1.5 text-ink-500"
          title={story.published ? "On the home page" : "Off the home page"}
        >
          {story.published ? (
            <Eye className="size-3.5" aria-hidden="true" />
          ) : (
            <EyeOff className="size-3.5" aria-hidden="true" />
          )}
          <Toggle
            size="sm"
            checked={story.published}
            disabled={locked}
            onChange={onToggle}
            label={`Publish story ${index + 1} on the home page`}
          />
        </span>

        <div className="flex items-center justify-between">
          <span className="flex items-center">
            <Button
              size="sm"
              variant="ghost"
              disabled={locked || index === 0}
              aria-label={`Move story ${index + 1} earlier`}
              onClick={() => onMove(-1)}
            >
              <ArrowLeft className="size-3.5 text-ink-400" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={locked || index === total - 1}
              aria-label={`Move story ${index + 1} later`}
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
              title="Replace the photograph"
              aria-label={`Replace the photograph on story ${index + 1}`}
              onClick={onReplace}
            >
              <Replace className="size-3.5 text-ink-400" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={locked}
              title="Edit the name, quote and product"
              aria-label={`Edit story ${index + 1}`}
              onClick={onEdit}
            >
              <Pencil className="size-3.5 text-ink-400" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={locked}
              aria-label={`Delete story ${index + 1}`}
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

// ============================================================
// THE EDITOR
// ============================================================

/**
 * What is printed on one card, beside the photograph.
 *
 * Edit only — there is nothing to create here, because a story starts as
 * a file and the only way in is the upload button. Every field may be
 * left empty: a card stripped back to its photograph is still a card.
 */
function StoryEditor({ story, products, onClose, onSaved }) {
  const toast = useToast();

  // Seeded once, from the story this instance was mounted for. The
  // parent keys this component on that story's id, so "open a different
  // card" is a remount and there is no effect here re-syncing a form
  // against a prop that changes every time the list refreshes.
  const [form, setForm] = useState(() => ({
    customerName: story?.customerName ?? "",
    body: story?.body ?? "",
    productId: story?.productId ?? "",
  }));
  const [productSearch, setProductSearch] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Two hundred products in one dropdown is a scroll, not a choice. The
  // filter narrows it; the cap keeps the list renderable when the filter
  // is empty. Same treatment as the reviews screen.
  const options = useMemo(() => {
    const term = productSearch.trim().toLowerCase();

    const matches = term
      ? products.filter((product) =>
          `${product.name} ${product.slug ?? ""}`.toLowerCase().includes(term),
        )
      : products;

    return matches.slice(0, 50);
  }, [products, productSearch]);

  // A story being edited may already point at a product that has fallen
  // out of `options` — because it is off sale, or simply past the cap.
  // Without this the Select would silently show "no product".
  const stranded =
    form.productId && !options.some((product) => product.id === form.productId);

  async function save() {
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
      const saved = await updateStory(story.id, form);

      onSaved({ story: saved, message: "Story updated" });
    } catch (error) {
      setFieldErrors(error?.fields ?? {});
      toast.error("Could not save the story", error?.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(story)}
      onClose={saving ? () => {} : onClose}
      title="Edit story"
      description="What is printed beside the photograph. The picture itself is changed from the card."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" busy={saving} onClick={save}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Quote"
          error={fieldErrors.body}
          hint="Optional. Publish the part worth reading rather than the whole message — left blank, the card is the photograph alone."
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
          hint="Optional, and as the shop wants it printed — “Meera K.”, “A customer from Erode”. Left blank, the card shows no name at all."
        >
          <Input
            value={form.customerName}
            invalid={Boolean(fieldErrors.customerName)}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Meera K."
            onChange={(e) =>
              setForm((f) => ({ ...f, customerName: e.target.value }))
            }
          />
        </Field>

        <Field
          label="Piece"
          error={fieldErrors.productId}
          hint={
            products.length === 0
              ? "The catalogue could not be loaded — reload the page to link this to a piece."
              : "Optional. With one chosen, the card links through to that piece. Type to narrow the list."
          }
        >
          <div className="space-y-2">
            <Input
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search products by name"
            />
            <Select
              value={form.productId}
              invalid={Boolean(fieldErrors.productId)}
              onChange={(e) =>
                setForm((f) => ({ ...f, productId: e.target.value }))
              }
            >
              <option value="">No piece</option>
              {stranded ? (
                <option value={form.productId}>
                  {story?.productName || "The piece this card names"}
                  {story?.productActive === false ? " (off sale)" : ""}
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
      </div>
    </Modal>
  );
}
