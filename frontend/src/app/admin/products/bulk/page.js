"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { ColourSwatch, ProductThumb } from "@/components/admin/ProductThumb";
import { DetailsFields, PricingFields } from "@/components/admin/ProductFields";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  cx,
  ErrorNotice,
  Field,
  Input,
  LinkButton,
  RequirementTag,
  Select,
  SkeletonRows,
  useToast,
} from "@/components/admin/ui";
import { bulkCreateProduct, getBootstrap } from "@/lib/api/products";
import { money, number } from "@/lib/format";
import { slugify } from "@/lib/mock/store";

const BLANK = {
  name: "",
  slug: "",
  description: "",
  category_id: "",
  size_chart_id: "",
  fit: "",
  base_price: "",
  discount_percent: 0,
  is_active: true,
  is_featured: false,
  attributes: {},
};

/**
 * F-03.04 — "Bulk upload a product with different variants and different images
 * at a time (description, size, price remain same)."
 *
 * Read literally: the description, the size run and the price are entered once
 * and shared; what differs per row is the colour and its images. So the screen
 * is a shared header plus a repeating colour block, and the cross-product of
 * sizes × colours becomes the variant set.
 */
export default function BulkUploadPage() {
  const router = useRouter();
  const toast = useToast();

  const [reference, setReference] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [sizes, setSizes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getBootstrap()
      .then((data) => {
        setReference(data);
        const first = data.attributes.colours.find((c) => c.approved);
        if (first) setGroups([makeGroup(first)]);
      })
      .catch(setFailure);
  }, []);

  const approvedSizes = useMemo(
    () => (reference?.attributes.sizes || []).filter((s) => s.approved).sort((a, b) => a.sort - b.sort),
    [reference],
  );
  const approvedColours = useMemo(
    () => (reference?.attributes.colours || []).filter((c) => c.approved),
    [reference],
  );

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function toggleSize(value) {
    setSizes((current) =>
      current.includes(value) ? current.filter((s) => s !== value) : [...current, value],
    );
  }

  function patchGroup(index, patch) {
    setGroups((current) => current.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  }

  function addGroup() {
    const used = new Set(groups.map((g) => g.colour));
    const next = approvedColours.find((c) => !used.has(c.value)) || approvedColours[0];
    if (next) setGroups((current) => [...current, makeGroup(next)]);
  }

  const totalVariants = sizes.length * groups.length;
  const totalUnits = groups.reduce((sum, g) => sum + (Number(g.stock) || 0) * sizes.length, 0);
  const totalImages = groups.reduce((sum, g) => sum + g.images.length, 0);
  const duplicateColour = groups.length !== new Set(groups.map((g) => g.colour)).size;

  async function submit() {
    setBusy(true);
    setErrors({});
    setFailure(null);
    try {
      const result = await bulkCreateProduct({
        ...form,
        slug: form.slug || slugify(form.name),
        sizes,
        colourGroups: groups.map((g) => ({
          colour: g.colour,
          colour_hex: g.colour_hex,
          stock: g.stock,
          images: g.images.map((img, i) => ({
            alt_text: img.alt_text,
            swatch_hex: g.colour_hex,
            swatch_seed: img.swatch_seed,
            display_order: i,
          })),
        })),
      });
      toast.success(
        `"${result.product.name}" created.`,
        `${result.summary.variants_created} variants from ${result.summary.colours} colours × ${result.summary.sizes} sizes, ${result.summary.images_created} images.`,
      );
      router.push(`/admin/products/${result.product.id}`);
    } catch (err) {
      if (err.fields) setErrors(err.fields);
      setFailure(err);
      toast.error(err.message || "Bulk upload failed.");
      setBusy(false);
    }
  }

  if (!reference && !failure) return <SkeletonRows rows={10} className="mx-auto max-w-5xl" />;

  const ready = form.name && form.category_id && form.base_price !== "" && sizes.length && groups.length && !duplicateColour;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink-900">
            Bulk upload
            <RequirementTag id="F-03.04" />
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Description, sizes and price are entered once. Each colour gets its own image set, and the
            size run is applied to every colour.
          </p>
        </div>
        <LinkButton variant="ghost" href="/admin/products">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to products
        </LinkButton>
      </div>

      {failure && !Object.keys(errors).length ? <ErrorNotice error={failure} /> : null}

      <Card>
        <CardHeader title="Shared details" description="Applies to every generated variant." />
        <div className="space-y-5 p-5">
          <DetailsFields form={form} setField={setField} errors={errors} reference={reference} />
          <hr className="border-ink-200" />
          <PricingFields form={form} setField={setField} errors={errors} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Size run"
          description="Applied identically to every colour below — the FRS's shared sizes."
        />
        <div className="p-5">
          <div className="flex flex-wrap gap-1.5">
            {approvedSizes.map((size) => (
              <button
                key={size.value}
                type="button"
                onClick={() => toggleSize(size.value)}
                className={cx(
                  "min-w-12 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                  sizes.includes(size.value)
                    ? "bg-brand-600 text-white ring-1 ring-brand-600"
                    : "bg-white text-ink-700 ring-1 ring-ink-300 hover:bg-ink-50",
                )}
              >
                {size.value}
              </button>
            ))}
          </div>
          {errors.sizes ? <p className="mt-2 text-xs text-red-600">{errors.sizes}</p> : null}
          <div className="mt-3 flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setSizes(approvedSizes.map((s) => s.value))}>
              Select all
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSizes(["S", "M", "L", "XL"])}>
              Standard run (S–XL)
            </Button>
            {sizes.length ? (
              <Button size="sm" variant="ghost" onClick={() => setSizes([])}>
                Clear
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Colours & images"
          requirement="F-03.04"
          description="One block per colour. Images added here attach to that colour's variants only."
          actions={
            <Button size="sm" variant="secondary" onClick={addGroup}>
              + Add colour
            </Button>
          }
        />
        <div className="space-y-4 p-5">
          {errors.colours ? <p className="text-xs text-red-600">{errors.colours}</p> : null}
          {duplicateColour ? (
            <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700 ring-1 ring-inset ring-red-200">
              Two blocks use the same colour — every (size, colour) pair must be unique
              (<code className="font-mono">uq_variant_product_combo</code>).
            </p>
          ) : null}

          {groups.map((group, index) => (
            <ColourGroup
              key={group.key}
              group={group}
              index={index}
              sizes={sizes}
              colours={approvedColours}
              basePrice={form.base_price}
              onPatch={(patch) => patchGroup(index, patch)}
              onRemove={() => setGroups((current) => current.filter((_, i) => i !== index))}
              removable={groups.length > 1}
            />
          ))}
        </div>
      </Card>

      <Card className="bg-ink-900 text-white ring-ink-900">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
          <Summary label="Colours" value={groups.length} />
          <Summary label="Sizes" value={sizes.length} />
          <Summary label="Variants created" value={totalVariants} highlight />
          <Summary label="Units in stock" value={number(totalUnits)} />
          <Summary label="Images" value={totalImages} />
          <div className="ml-auto text-right">
            <p className="text-[11px] text-white/60">Each variant sells for</p>
            <p className="tabular text-lg font-semibold">
              {money(
                Math.round(
                  (Number(form.base_price) || 0) * (100 - (Number(form.discount_percent) || 0)),
                ) / 100,
              )}
            </p>
          </div>
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <p className="text-xs text-ink-500">
            {totalVariants ? (
              <>
                Will create <strong className="text-ink-800">{totalVariants}</strong> variants and{" "}
                <strong className="text-ink-800">{totalImages}</strong> images in one transaction.
              </>
            ) : (
              "Pick at least one size and one colour."
            )}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <LinkButton variant="ghost" href="/admin/products">
              Cancel
            </LinkButton>
            <Button variant="primary" size="lg" busy={busy} disabled={!ready} onClick={submit}>
              Upload {totalVariants || ""} variant{totalVariants === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

let groupCounter = 0;
function makeGroup(colour) {
  return {
    key: `group-${++groupCounter}`,
    colour: colour.value,
    colour_hex: colour.hex,
    stock: 20,
    images: [],
  };
}

function ColourGroup({ group, index, sizes, colours, basePrice, onPatch, onRemove, removable }) {
  const fileRef = useRef(null);

  function addFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    onPatch({
      images: [
        ...group.images,
        ...files.map((file, i) => ({
          local_id: `${group.key}-${group.images.length + i}`,
          alt_text: file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "),
          swatch_seed: (index + 1) * 31 + group.images.length + i,
        })),
      ],
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="rounded-xl bg-ink-50/70 p-4 ring-1 ring-inset ring-ink-200">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={`Colour ${index + 1}`} className="min-w-44">
          <Select
            value={group.colour}
            onChange={(e) => {
              const picked = colours.find((c) => c.value === e.target.value);
              onPatch({ colour: e.target.value, colour_hex: picked?.hex || "#94a3b8" });
            }}
          >
            {colours.map((colour) => (
              <option key={colour.value} value={colour.value}>
                {colour.value}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Swatch">
          <input
            type="color"
            value={group.colour_hex}
            onChange={(e) => onPatch({ colour_hex: e.target.value })}
            aria-label={`Swatch hex for ${group.colour}`}
            className="h-9 w-14 cursor-pointer rounded border border-ink-300 bg-white p-1"
          />
        </Field>

        <Field label="Stock per size" hint="Applied to each size in the run.">
          <Input
            type="number"
            min={0}
            value={group.stock}
            onChange={(e) => onPatch({ stock: e.target.value })}
            className="tabular w-28 text-right"
          />
        </Field>

        <div className="ml-auto flex items-center gap-2">
          <Badge tone="neutral">
            {sizes.length} variant{sizes.length === 1 ? "" : "s"}
          </Badge>
          {removable ? (
            <Button size="sm" variant="danger" onClick={onRemove}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[11px] font-semibold text-ink-600">
            Images for <ColourSwatch hex={group.colour_hex} name={group.colour} size={11} />
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
            + Add images
          </Button>
        </div>

        {group.images.length === 0 ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center justify-center rounded-lg border border-dashed border-ink-300 bg-white/60 px-4 py-6 text-xs text-ink-500 hover:border-brand-400 hover:text-brand-600"
          >
            Drop or choose images for {group.colour}
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            {group.images.map((image, i) => (
              <div key={image.local_id} className="relative">
                <ProductThumb hex={group.colour_hex} seed={image.swatch_seed} size={72} rounded="rounded-lg" />
                <button
                  type="button"
                  aria-label={`Remove image ${i + 1}`}
                  onClick={() =>
                    onPatch({ images: group.images.filter((img) => img.local_id !== image.local_id) })
                  }
                  className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-white text-[10px] text-red-600 shadow ring-1 ring-ink-900/10 hover:bg-red-50"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {sizes.length ? (
        <p className="tabular mt-3 text-[11px] text-ink-500">
          Generates {sizes.map((s) => `${s}/${group.colour}`).join(", ")} at{" "}
          {money(Number(basePrice) || 0)} each.
        </p>
      ) : null}
    </div>
  );
}

function Summary({ label, value, highlight }) {
  return (
    <div>
      <p className="text-[11px] tracking-wide text-white/60 uppercase">{label}</p>
      <p className={cx("tabular mt-0.5 text-xl font-semibold", highlight && "text-gold-300")}>{value}</p>
    </div>
  );
}
