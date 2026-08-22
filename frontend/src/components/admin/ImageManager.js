"use client";

import { ChevronLeft, ChevronRight, Ellipsis, Image as ImageIcon, Images, X } from "lucide-react";
import { useRef, useState } from "react";

import { ImageTile } from "./ProductThumb";
import { Button, cx, EmptyState, Input, RequirementTag, Select } from "./ui";

/**
 * F-03.06 — image management, and the variant_id half of F-03.04.
 *
 * Images with a variant attached swap in when the shopper picks that colour;
 * images with no variant form the shared product gallery. Exactly one gallery
 * image is the primary (uq_images_one_primary).
 *
 * There is no upload endpoint yet, so "adding" a file records a placeholder
 * whose colour is the swatch it will eventually carry. Everything else — order,
 * primary flag, variant binding, alt text — behaves exactly as it will against
 * Cloudinary.
 */
export function ImageManager({
  images,
  variants,
  onAdd,
  onRemove,
  onSetPrimary,
  onAssign,
  onReorder,
  onAltChange,
  busy = false,
  compact = false,
}) {
  const fileRef = useRef(null);
  const [pendingColour, setPendingColour] = useState(variants[0]?.colour_hex || "#c21e56");

  const gallery = images.filter((i) => i.variant_id == null && i.variant_index == null);
  const byVariant = images.filter((i) => i.variant_id != null || i.variant_index != null);

  function variantLabel(image) {
    const variant =
      variants.find((v) => v.id === image.variant_id) ||
      variants[image.variant_index] ||
      null;
    return variant ? `${variant.size} · ${variant.colour}` : "Gallery";
  }

  function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    onAdd(
      files.map((file, i) => ({
        alt_text: file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "),
        swatch_hex: pendingColour,
        swatch_seed: Math.floor(Math.random() * 977) + i,
      })),
    );
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-lg bg-ink-50 p-3 ring-1 ring-inset ring-ink-200">
        <div>
          <p className="mb-1.5 text-[11px] font-medium text-ink-500">Swatch colour for new images</p>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={pendingColour}
              onChange={(e) => setPendingColour(e.target.value)}
              aria-label="Placeholder swatch colour"
              className="h-9 w-12 cursor-pointer rounded border border-ink-300 bg-white p-1"
            />
            <Select
              value={pendingColour}
              onChange={(e) => setPendingColour(e.target.value)}
              aria-label="Use a variant colour"
              className="w-auto"
            >
              {[...new Map(variants.map((v) => [v.colour_hex, v])).values()].map((v) => (
                <option key={v.colour_hex} value={v.colour_hex}>
                  {v.colour}
                </option>
              ))}
              <option value="#c21e56">Brand rose</option>
            </Select>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button variant="primary" busy={busy} onClick={() => fileRef.current?.click()}>
          Add images
        </Button>
        <span className="text-[11px] text-ink-500">
          JPEG or PNG, up to 5&nbsp;MB each. Uploads land in Cloudinary and store an{" "}
          <code className="font-mono">image_public_id</code> so they can be deleted later.
        </span>
      </div>

      <Section
        title="Product gallery"
        requirement="F-03.06"
        description="Shown on the product page regardless of the colour selected. Exactly one is primary — that is the thumbnail everywhere else."
      >
        {gallery.length === 0 ? (
          <EmptyState icon={<ImageIcon aria-hidden="true" />} title="No gallery images" description="Add at least one — the first becomes the primary." />
        ) : (
          <TileGrid compact={compact}>
            {gallery.map((image, index) => (
              <ImageTile key={image.id ?? index} image={image} variantLabel="Gallery">
                <Controls
                  image={image}
                  index={index}
                  total={gallery.length}
                  variants={variants}
                  variantValue=""
                  onSetPrimary={onSetPrimary}
                  onRemove={onRemove}
                  onAssign={onAssign}
                  onReorder={onReorder}
                  onAltChange={onAltChange}
                />
              </ImageTile>
            ))}
          </TileGrid>
        )}
      </Section>

      <Section
        title="Variant-specific images"
        requirement="F-03.04"
        description="Bound to one variant. The storefront swaps these in when the shopper picks that colour."
      >
        {byVariant.length === 0 ? (
          <EmptyState
            icon={<Images aria-hidden="true" />}
            title="No variant images"
            description="Assign a gallery image to a variant to give a colour its own photograph."
          />
        ) : (
          <TileGrid compact={compact}>
            {byVariant.map((image, index) => (
              <ImageTile key={image.id ?? `v-${index}`} image={image} variantLabel={variantLabel(image)}>
                <Controls
                  image={image}
                  index={index}
                  total={byVariant.length}
                  variants={variants}
                  variantValue={String(image.variant_id ?? image.variant_index ?? "")}
                  onSetPrimary={null}
                  onRemove={onRemove}
                  onAssign={onAssign}
                  onReorder={onReorder}
                  onAltChange={onAltChange}
                />
              </ImageTile>
            ))}
          </TileGrid>
        )}
      </Section>
    </div>
  );
}

function Section({ title, description, requirement, children }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h3 className="text-xs font-semibold text-ink-800">{title}</h3>
        <RequirementTag id={requirement} />
        <p className="text-[11px] text-ink-500">{description}</p>
      </div>
      {children}
    </div>
  );
}

function TileGrid({ compact, children }) {
  return (
    <div
      className={cx(
        "grid gap-3",
        compact
          ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
          : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
      )}
    >
      {children}
    </div>
  );
}

function Controls({
  image,
  index,
  total,
  variants,
  variantValue,
  onSetPrimary,
  onRemove,
  onAssign,
  onReorder,
  onAltChange,
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <IconButton label="Edit image" onClick={() => setOpen((v) => !v)}>
          <Ellipsis className="size-3.5" aria-hidden="true" />
        </IconButton>
        <IconButton label="Remove image" tone="danger" onClick={() => onRemove(image)}>
          <X className="size-3.5" aria-hidden="true" />
        </IconButton>
      </div>

      {open ? (
        <div className="sb-enter absolute inset-0 flex flex-col gap-1.5 bg-white/96 p-2 text-[11px]">
          <Input
            value={image.alt_text || ""}
            onChange={(e) => onAltChange(image, e.target.value)}
            placeholder="Alt text"
            aria-label="Alt text"
            className="h-7 px-2 py-0 text-[11px]"
          />
          <Select
            value={variantValue}
            onChange={(e) => onAssign(image, e.target.value)}
            aria-label="Attach to variant"
            className="h-7 px-2 py-0 text-[11px]"
          >
            <option value="">Product gallery (no variant)</option>
            {variants.map((variant, i) => (
              <option key={variant.id ?? i} value={variant.id ?? i}>
                {variant.size} · {variant.colour}
              </option>
            ))}
          </Select>
          <div className="mt-auto flex items-center gap-1">
            <MiniButton
              disabled={index === 0}
              onClick={() => onReorder(image, -1)}
              aria-label="Move image earlier"
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
            </MiniButton>
            <MiniButton
              disabled={index === total - 1}
              onClick={() => onReorder(image, 1)}
              aria-label="Move image later"
            >
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </MiniButton>
            {onSetPrimary ? (
              <MiniButton disabled={image.is_primary} onClick={() => onSetPrimary(image)}>
                Primary
              </MiniButton>
            ) : null}
            <MiniButton className="ml-auto" onClick={() => setOpen(false)}>
              Done
            </MiniButton>
          </div>
        </div>
      ) : null}
    </>
  );
}

function IconButton({ label, tone, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cx(
        "flex size-6 items-center justify-center rounded bg-white/90 text-xs shadow ring-1 ring-ink-900/10",
        tone === "danger" ? "text-red-600 hover:bg-red-50" : "text-ink-700 hover:bg-white",
      )}
    >
      {children}
    </button>
  );
}

function MiniButton({ disabled, onClick, className, children, ...props }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "rounded border border-ink-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-ink-700",
        "hover:bg-ink-50 disabled:cursor-not-allowed disabled:text-ink-300",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
