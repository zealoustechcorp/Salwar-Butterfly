"use client";

import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  ACCEPT_ATTRIBUTE,
  MAX_IMAGES,
  deleteImage,
  makeCover,
  rejectionReason,
  reorderImages,
  updateImageAltText,
  uploadImages,
} from "@/lib/api/images";
import { Badge, Button, Input, Modal, cx, useToast } from "./ui";

/**
 * A product's photographs — F-03.06.
 *
 * Two shapes, because a product must exist before it can be
 * photographed:
 *
 *   ProductGallery  a saved product. Every action writes straight
 *                   through to the API and the gallery it returns is
 *                   the new truth.
 *
 *   StagedGallery   the create screen, where there is no product id yet.
 *                   Files are held in the browser and handed to the
 *                   parent, which uploads them once the product row is
 *                   written.
 *
 * The cover is position 0 — there is no primary flag anywhere in the
 * stack, so "make cover" is a reorder and the two can never disagree.
 * Ordering is done with move-left/move-right buttons rather than
 * drag-and-drop: it is reorderable from the keyboard, needs no pointer
 * precision, and a gallery caps at eight.
 */

// ============================================================
// SAVED PRODUCT
// ============================================================

/**
 * @param {object} props
 * @param {string} props.productId
 * @param {Array} props.images    current gallery, in order
 * @param {(images: Array) => void} props.onChange  called with the gallery
 *                                                  the API returned
 * @param {boolean} [props.disabled]
 */
export function ProductGallery({ productId, images, onChange, disabled = false }) {
  const toast = useToast();
  const inputRef = useRef(null);

  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const room = MAX_IMAGES - images.length;

  /** Wraps a write so the whole gallery is disabled while it is in flight. */
  async function run(work, failureMessage) {
    setBusy(true);
    try {
      return await work();
    } catch (err) {
      toast.error(err.message || failureMessage);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function upload(fileList) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    // Checked here so a rejected file costs nothing; the API checks the
    // bytes themselves, which is the check that counts.
    const rejected = files.map(rejectionReason).filter(Boolean);

    if (rejected.length) {
      toast.error(rejected[0], rejected.length > 1 ? `And ${rejected.length - 1} more.` : undefined);
      return;
    }

    if (files.length > room) {
      toast.error(
        `Only ${room} more image${room === 1 ? "" : "s"} fit — a product holds at most ${MAX_IMAGES}.`,
      );
      return;
    }

    const result = await run(
      () => uploadImages(productId, files),
      "The upload failed.",
    );

    if (result) {
      onChange(result.images);
      toast.success(
        `${result.added} image${result.added === 1 ? "" : "s"} added.`,
        images.length === 0 ? "The first one is the cover." : undefined,
      );
    }
  }

  async function move(index, delta) {
    const next = [...images];
    const target = index + delta;

    if (target < 0 || target >= next.length) return;

    [next[index], next[target]] = [next[target], next[index]];

    // Shown in the new order straight away; the API's answer replaces it.
    onChange(next);

    const saved = await run(
      () => reorderImages(productId, next.map((image) => image.id)),
      "Could not save the new order.",
    );

    // A failed reorder would otherwise leave the screen claiming an order
    // the catalogue does not have.
    onChange(saved ?? images);
  }

  async function promote(image) {
    const saved = await run(
      () => makeCover(productId, image.id, images),
      "Could not change the cover.",
    );

    if (saved) {
      onChange(saved);
      toast.success("Cover image updated.");
    }
  }

  async function saveAltText(image, altText) {
    if (altText === image.altText) return;

    const saved = await run(
      () => updateImageAltText(image.id, altText),
      "Could not save the description.",
    );

    if (saved) {
      onChange(images.map((row) => (row.id === saved.id ? saved : row)));
    }
  }

  async function remove(image) {
    const done = await run(
      () => deleteImage(image.id),
      "Could not remove the image.",
    );

    setPendingDelete(null);

    if (done) {
      const next = images
        .filter((row) => row.id !== image.id)
        // The API closes the gap, so the next image becomes the cover.
        .map((row, index) => ({ ...row, position: index, isPrimary: index === 0 }));

      onChange(next);
      toast.success(
        "Image removed.",
        image.isPrimary && next.length ? "The next image is now the cover." : undefined,
      );
    }
  }

  const locked = disabled || busy;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-ink-700">
            {images.length} of {MAX_IMAGES} images
          </p>
          <p className="mt-0.5 text-[11px] text-ink-500">
            The first image is the cover — it is what shoppers see in the listing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
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
          <Button
            variant="secondary"
            busy={busy}
            disabled={locked || room <= 0}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-3.5" aria-hidden="true" />
            {images.length ? "Add images" : "Upload images"}
          </Button>
        </div>
      </div>

      {room <= 0 ? (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
          This product holds the maximum of {MAX_IMAGES} images. Remove one to add another.
        </p>
      ) : null}

      {images.length === 0 ? (
        <EmptyGallery
          disabled={locked}
          onPick={() => inputRef.current?.click()}
          note="Until a photograph is added, this product shows an illustrated swatch on every screen."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image, index) => (
            <ImageTile
              key={image.id}
              image={image}
              index={index}
              total={images.length}
              disabled={locked}
              onMove={(delta) => move(index, delta)}
              onPromote={() => promote(image)}
              onAltText={(value) => saveAltText(image, value)}
              onRemove={() => setPendingDelete(image)}
            />
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Remove this image?"
        description="The photograph is deleted from the catalogue and from storage. This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" busy={busy} onClick={() => remove(pendingDelete)}>
              Remove image
            </Button>
          </>
        }
      >
        {pendingDelete ? (
          <div className="flex items-center gap-3">
            <Thumbnail
              src={pendingDelete.url}
              alt={pendingDelete.altText || "Product photograph"}
              className="size-20 rounded-lg"
            />
            <div className="text-xs text-ink-600">
              {pendingDelete.isPrimary ? (
                <p className="font-medium text-ink-800">
                  This is the cover image. The next one takes its place.
                </p>
              ) : (
                <p className="font-medium text-ink-800">Image {pendingDelete.position + 1}</p>
              )}
              {pendingDelete.altText ? (
                <p className="mt-1 text-ink-500">“{pendingDelete.altText}”</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

// ============================================================
// UNSAVED PRODUCT
// ============================================================

/**
 * The create screen's gallery. There is no product id to upload against
 * yet, so files are held here and previewed from object URLs; the parent
 * uploads them after the product is created.
 *
 * @param {object} props
 * @param {File[]} props.files
 * @param {(files: File[]) => void} props.onChange
 */
export function StagedGallery({ files, onChange, disabled = false }) {
  const toast = useToast();
  const inputRef = useRef(null);

  // Derived, not state: the previews are a pure function of the files.
  const previews = useMemo(
    () => files.map((file) => URL.createObjectURL(file)),
    [files],
  );

  // An object URL pins the file in memory until it is revoked, so each
  // batch is released when the list it describes is replaced.
  useEffect(
    () => () => previews.forEach((url) => URL.revokeObjectURL(url)),
    [previews],
  );

  const room = MAX_IMAGES - files.length;

  function add(fileList) {
    const picked = Array.from(fileList ?? []);
    if (!picked.length) return;

    const rejected = picked.map(rejectionReason).filter(Boolean);

    if (rejected.length) {
      toast.error(rejected[0]);
      return;
    }

    if (picked.length > room) {
      toast.error(
        `Only ${room} more image${room === 1 ? "" : "s"} fit — a product holds at most ${MAX_IMAGES}.`,
      );
      return;
    }

    onChange([...files, ...picked]);
  }

  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= files.length) return;

    const next = [...files];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-ink-700">
            {files.length} of {MAX_IMAGES} images
          </p>
          <p className="mt-0.5 text-[11px] text-ink-500">
            Uploaded once the product is created. The first is the cover.
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          disabled={disabled || room <= 0}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          variant="secondary"
          disabled={disabled || room <= 0}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-3.5" aria-hidden="true" />
          {files.length ? "Add images" : "Choose images"}
        </Button>
      </div>

      {files.length === 0 ? (
        <EmptyGallery
          disabled={disabled}
          onPick={() => inputRef.current?.click()}
          note="Optional — photographs can be added after the product is created."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.lastModified}-${index}`}
              className="overflow-hidden rounded-lg ring-1 ring-ink-200"
            >
              <div className="relative aspect-3/4 bg-ink-50">
                <Thumbnail src={previews[index]} alt={file.name} className="size-full" />
                {index === 0 ? (
                  <span className="absolute top-1.5 left-1.5">
                    <Badge tone="gold">Cover</Badge>
                  </span>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-1 border-t border-ink-200 px-2 py-1.5">
                <span className="truncate text-[11px] text-ink-500" title={file.name}>
                  {file.name}
                </span>
                <span className="flex shrink-0 items-center">
                  <MoveButtons
                    index={index}
                    total={files.length}
                    disabled={disabled}
                    onMove={(delta) => move(index, delta)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={`Remove ${file.name}`}
                    onClick={() => onChange(files.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-3.5 text-ink-400" aria-hidden="true" />
                  </Button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================
// PIECES
// ============================================================

function ImageTile({
  image,
  index,
  total,
  disabled,
  onMove,
  onPromote,
  onAltText,
  onRemove,
}) {
  return (
    <li className="overflow-hidden rounded-lg ring-1 ring-ink-200">
      <div className="relative aspect-3/4 bg-ink-50">
        <Thumbnail
          src={image.url}
          alt={image.altText || `Product photograph ${index + 1}`}
          className="size-full"
        />

        {image.isPrimary ? (
          <span className="absolute top-1.5 left-1.5">
            <Badge tone="gold">Cover</Badge>
          </span>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={onPromote}
            title="Make this the cover image"
            className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-white/90 px-1.5 py-1 text-[11px] font-medium text-ink-700 opacity-0 ring-1 ring-ink-300 transition-opacity group-hover:opacity-100 hover:bg-white focus-visible:opacity-100 disabled:opacity-50"
          >
            <Star className="size-3" aria-hidden="true" />
            Cover
          </button>
        )}
      </div>

      <div className="space-y-1.5 border-t border-ink-200 p-2">
        {/* Uncontrolled: the field is the source of truth while it is
            being typed in, and saves on blur. Holding it in state would
            mean an effect to re-sync it whenever the API returns fresh
            rows — a reorder does that on every move. */}
        <Input
          defaultValue={image.altText ?? ""}
          disabled={disabled}
          onBlur={(e) => onAltText(e.target.value.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="Describe the photo…"
          maxLength={200}
          className="h-7 text-[11px]"
          aria-label={`Description for image ${index + 1}`}
        />

        <div className="flex items-center justify-between">
          <MoveButtons index={index} total={total} disabled={disabled} onMove={onMove} />
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            aria-label={`Remove image ${index + 1}`}
            onClick={onRemove}
          >
            <Trash2 className="size-3.5 text-ink-400" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </li>
  );
}

function MoveButtons({ index, total, disabled, onMove }) {
  return (
    <span className="flex items-center">
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled || index === 0}
        aria-label={`Move image ${index + 1} earlier`}
        onClick={() => onMove(-1)}
      >
        <ArrowLeft className="size-3.5 text-ink-400" aria-hidden="true" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled || index === total - 1}
        aria-label={`Move image ${index + 1} later`}
        onClick={() => onMove(1)}
      >
        <ArrowRight className="size-3.5 text-ink-400" aria-hidden="true" />
      </Button>
    </span>
  );
}

function EmptyGallery({ onPick, disabled, note }) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={cx(
        "flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-ink-300 px-4 py-10 text-center transition-colors",
        disabled ? "opacity-50" : "hover:border-brand-400 hover:bg-brand-50/40",
      )}
    >
      <ImagePlus className="size-6 text-ink-400" aria-hidden="true" />
      <span className="text-sm font-medium text-ink-700">No photographs yet</span>
      <span className="max-w-sm text-[11px] text-ink-500">{note}</span>
      <span className="text-[11px] text-ink-400">JPEG, PNG or WebP · up to 5 MB each</span>
    </button>
  );
}

/**
 * A plain `img` rather than `next/image`: these are admin thumbnails on a
 * screen behind a login, the source is an arbitrary Cloudinary account,
 * and half of them are `blob:` previews the optimizer cannot fetch.
 */
function Thumbnail({ src, alt, className }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={cx("object-cover", className)}
    />
  );
}

export { Thumbnail as GalleryThumbnail };
