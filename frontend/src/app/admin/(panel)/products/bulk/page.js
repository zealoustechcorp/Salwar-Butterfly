"use client";

import { ArrowLeft, ImagePlus, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
  Modal,
  Select,
  SkeletonRows,
  Textarea,
  Toggle,
  useToast,
} from "@/components/admin/ui";
import { AttributeFields } from "@/components/admin/ProductFields";
import { StagedGallery } from "@/components/admin/ProductGallery";
import { SizeStockEditor } from "@/components/admin/SizeStockEditor";
import { listAttributeValues } from "@/lib/api/attributes";
import { uploadImages } from "@/lib/api/images";
import { bulkCreateProducts, getReference } from "@/lib/api/products";
import { replaceVariants } from "@/lib/api/variants";
import { money, number } from "@/lib/format";
import { autoSlug } from "@/lib/slug";

/**
 * Bulk upload — many products into one category (F-03.04).
 *
 * `POST /products/bulkCreateProducts` takes a shared `categoryId` and an
 * array of products, and inserts them in one statement. So the screen is
 * a shared header (category, description, price, offer, visibility) plus
 * a repeating row where only what actually differs per product is typed:
 * its name, its slug, any price override — and its photographs.
 *
 * A blank price on a row inherits the shared one — that is the whole
 * point of the shared header, and it keeps a twenty-row upload to twenty
 * names instead of twenty forms.
 *
 * Photographs are the one thing that cannot be shared, which is what
 * F-03.04 means by "different images at a time": the description, sizes
 * and price are the same across the batch, but two anarkalis are not the
 * same photograph. So each row stages its own files, exactly as the
 * single create screen does, and they upload once the product rows
 * exist and have ids to hang from.
 */

const BLANK_SHARED = {
  categoryId: "",
  subCategoryId: "",
  description: "",
  basePrice: "",
  discountPercentage: 0,
  attributes: {},
  isFeatured: false,
  active: true,
};

/** Applied to every product in the batch. */
const DEFAULT_SIZES = ["S", "M", "L", "XL"].map((size) => ({
  size,
  stockQuantity: 0,
  active: true,
}));

let rowCounter = 0;
const makeRow = () => ({
  key: `row-${++rowCounter}`,
  name: "",
  slug: "",
  basePrice: "",
  // Held in the browser until the product row exists to upload against.
  photos: [],
});

export default function BulkUploadPage() {
  const router = useRouter();
  const toast = useToast();

  const [reference, setReference] = useState(null);
  const [attributeGroups, setAttributeGroups] = useState({});
  const [shared, setShared] = useState(BLANK_SHARED);
  const [sizes, setSizes] = useState(DEFAULT_SIZES);
  const [rows, setRows] = useState(() => [makeRow(), makeRow(), makeRow()]);
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);

  // Which row's gallery is open. A modal rather than a gallery inside
  // the cell: eight thumbnails do not belong in a table row, and the
  // create screen's StagedGallery already does the job properly.
  const [photoRow, setPhotoRow] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    getReference({ signal: controller.signal })
      .then(setReference)
      .catch((err) => {
        if (err?.name !== "AbortError") setFailure(err);
      });

    // Fills the attribute dropdowns. An empty or failed register still
    // lets the form save, and a value can be added inline.
    listAttributeValues({ activeOnly: true, signal: controller.signal })
      .then(setAttributeGroups)
      .catch(() => {});

    return () => controller.abort();
  }, []);

  // Re-read after a value is registered inline. Only fills the
  // dropdowns, so a failure here never blocks the form.
  /**
   * Re-reads the register after a value is added inline. A plain
   * function: it is only passed to a child, never used as an effect
   * dependency.
   */
  async function refreshAttributes() {
    try {
      setAttributeGroups(await listAttributeValues({ activeOnly: true }));
    } catch {
      // Dropdown options only — never worth blocking the form.
    }
  }

  const subCategories = useMemo(
    () => (reference?.subCategories ?? []).filter((sub) => sub.categoryId === shared.categoryId),
    [reference, shared.categoryId],
  );

  function setSharedField(key, value) {
    setShared((current) => ({ ...current, [key]: value }));
  }

  function patchRow(index, patch) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  /** Rows with a name are the ones that will be sent. */
  const filled = rows.filter((row) => row.name.trim());

  const slugs = filled.map((row) => row.slug.trim() || autoSlug(row.name));
  const duplicateSlug = slugs.length !== new Set(slugs).size;

  const sharedPrice = Number(shared.basePrice) || 0;
  const percent = Number(shared.discountPercentage) || 0;

  const totalValue = filled.reduce((sum, row) => {
    const base = row.basePrice === "" ? sharedPrice : Number(row.basePrice) || 0;
    return sum + Math.round(base * (100 - percent)) / 100;
  }, 0);

  const totalPhotos = filled.reduce((sum, row) => sum + row.photos.length, 0);

  const ready =
    Boolean(shared.categoryId) &&
    filled.length > 0 &&
    !duplicateSlug &&
    filled.every((row) => {
      const base = row.basePrice === "" ? shared.basePrice : row.basePrice;
      return base !== "" && Number(base) >= 0;
    });

  async function submit() {
    setBusy(true);
    setFailure(null);
    try {
      const created = await bulkCreateProducts(
        shared.categoryId,
        filled.map((row) => ({
          name: row.name,
          slug: row.slug.trim() || autoSlug(row.name),
          description: shared.description,
          subCategoryId: shared.subCategoryId,
          attributes: shared.attributes,
          basePrice: row.basePrice === "" ? shared.basePrice : row.basePrice,
          discountPercentage: shared.discountPercentage,
          isFeatured: shared.isFeatured,
          active: shared.active,
        })),
      );

      // Sizes are per-product rows in another table, so the batch insert
      // above cannot carry them — each new product gets the shared size
      // run in its own request.
      let sizeFailures = 0;

      if (sizes.length) {
        const results = await Promise.allSettled(
          created.map((product) => replaceVariants(product.id, sizes)),
        );
        sizeFailures = results.filter((r) => r.status === "rejected").length;
      }

      // Photographs need an id to hang from, so they upload now.
      //
      // Matched back to their row by slug rather than by array position:
      // slugs are unique across the catalogue and the screen has already
      // refused duplicates, whereas the order of a multi-row INSERT ...
      // RETURNING is not something to hang a photograph on.
      const bySlug = new Map(created.map((product) => [product.slug, product]));
      const withPhotos = filled.filter((row) => row.photos.length > 0);

      let photoFailures = 0;

      if (withPhotos.length) {
        const results = await Promise.allSettled(
          withPhotos.map((row) => {
            const product = bySlug.get(row.slug.trim() || autoSlug(row.name));

            if (!product) {
              return Promise.reject(new Error(`No product came back for "${row.name}"`));
            }

            return uploadImages(product.id, row.photos);
          }),
        );

        photoFailures = results.filter((r) => r.status === "rejected").length;
      }

      // The products themselves are created either way, so a failure
      // here is a warning about what still needs doing, not an error
      // about what was lost.
      const shortfalls = [
        sizeFailures ? `${sizeFailures} did not get their sizes` : null,
        photoFailures ? `${photoFailures} did not get their photographs` : null,
      ].filter(Boolean);

      if (shortfalls.length) {
        toast.error(
          `${created.length} product${created.length === 1 ? "" : "s"} created, but ${shortfalls.join(" and ")}.`,
          "Open those products and finish them from the edit screen.",
        );
      } else {
        const notes = [
          sizes.length ? `${sizes.length} size${sizes.length === 1 ? "" : "s"} each` : null,
          withPhotos.length
            ? `${number(withPhotos.reduce((sum, row) => sum + row.photos.length, 0))} photographs`
            : null,
        ].filter(Boolean);

        toast.success(
          `${created.length} product${created.length === 1 ? "" : "s"} created.`,
          notes.join(", ") || undefined,
        );
      }

      router.push("/admin/products");
    } catch (err) {
      setFailure(err);
      toast.error(err.message || "Bulk upload failed.");
      setBusy(false);
    }
  }

  if (!reference && !failure) return <SkeletonRows rows={10} className="mx-auto max-w-5xl" />;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">Bulk upload</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Category, description, price and offer are entered once and shared. Each row below adds
            one product; leave its price blank to inherit the shared one.
          </p>
        </div>
        <LinkButton variant="ghost" href="/admin/products">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to products
        </LinkButton>
      </div>

      {failure ? <ErrorNotice error={failure} /> : null}

      <Card>
        <CardHeader title="Shared details" description="Applies to every product in this upload." />
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Category" required hint="One category for the whole batch.">
            <Select
              value={shared.categoryId}
              onChange={(e) => {
                setSharedField("categoryId", e.target.value);
                setSharedField("subCategoryId", "");
              }}
            >
              <option value="">Select a category…</option>
              {(reference?.categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.active ? "" : " — inactive"}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Sub-category"
            hint={shared.categoryId ? "Optional." : "Pick a category first."}
          >
            <Select
              value={shared.subCategoryId}
              disabled={!shared.categoryId || subCategories.length === 0}
              onChange={(e) => setSharedField("subCategoryId", e.target.value)}
            >
              <option value="">
                {shared.categoryId && subCategories.length === 0
                  ? "No sub-categories in this category"
                  : "None"}
              </option>
              {subCategories.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Description"
            className="md:col-span-2"
            hint="Shared by every product in the batch — edit individually afterwards if they differ."
          >
            <Textarea
              value={shared.description}
              onChange={(e) => setSharedField("description", e.target.value)}
              placeholder="Chanderi silk, dry clean only, unstitched…"
            />
          </Field>

          <Field label="Base price (₹)" required hint="A row can override this.">
            <Input
              type="number"
              min={0}
              step={1}
              value={shared.basePrice}
              onChange={(e) => setSharedField("basePrice", e.target.value)}
              className="tabular"
              placeholder="0"
            />
          </Field>

          <Field label="Discount %" hint="0–100, applied to every product in the batch.">
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={shared.discountPercentage}
              onChange={(e) => setSharedField("discountPercentage", e.target.value)}
              className="tabular"
            />
          </Field>

          <div className="flex items-center justify-between gap-3 rounded-lg bg-ink-50 px-3 py-2.5 ring-1 ring-inset ring-ink-200">
            <p className="text-xs font-semibold text-ink-700">Feature all on the home page</p>
            <Toggle
              checked={shared.isFeatured}
              onChange={(value) => setSharedField("isFeatured", value)}
              label="Feature all on the home page"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg bg-ink-50 px-3 py-2.5 ring-1 ring-inset ring-ink-200">
            <div>
              <p className="text-xs font-semibold text-ink-700">Publish to storefront</p>
              <p className="text-[11px] text-ink-500">Turn off to upload the batch as drafts.</p>
            </div>
            <Toggle
              checked={shared.active}
              onChange={(value) => setSharedField("active", value)}
              label="Publish to storefront"
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Sizes & stock"
          description="The same size run is given to every product in the batch. Stock can be corrected per product afterwards."
        />
        <div className="p-5">
          <SizeStockEditor rows={sizes} onChange={setSizes} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Attributes"
          description="Shared by the batch — fabric, work and sleeve."
        />
        <div className="p-5">
          <AttributeFields
            form={shared}
            setField={setSharedField}
            groups={attributeGroups}
            onRegister={refreshAttributes}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Products"
          description="One row per product — its own name, price and photographs. Empty rows are ignored."
          actions={
            <Button size="sm" variant="secondary" onClick={() => setRows((c) => [...c, makeRow()])}>
              <Plus className="size-3.5" aria-hidden="true" />
              Add row
            </Button>
          }
        />

        {duplicateSlug ? (
          <p className="mx-5 mt-4 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 ring-1 ring-inset ring-red-200">
            Two rows resolve to the same URL slug. Slugs are unique across the whole catalogue, so
            the upload would be rejected.
          </p>
        ) : null}

        <div className="overflow-x-auto p-5">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                <th className="w-8 pb-2" />
                <th className="pb-2 pr-3">Product name</th>
                <th className="pb-2 pr-3">URL slug</th>
                <th className="pb-2 pr-3 text-right">Price override</th>
                <th className="pb-2 pr-3 text-right">Sells at</th>
                <th className="pb-2 pr-3">Photos</th>
                <th className="w-10 pb-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const derivedSlug = row.slug.trim() || autoSlug(row.name);
                const base = row.basePrice === "" ? sharedPrice : Number(row.basePrice) || 0;
                const filledRow = Boolean(row.name.trim());

                return (
                  <tr key={row.key} className={cx(!filledRow && "opacity-60")}>
                    <td className="py-1.5 pr-2 text-right text-[11px] text-ink-400">{index + 1}</td>
                    <td className="py-1.5 pr-3">
                      <Input
                        value={row.name}
                        onChange={(e) => patchRow(index, { name: e.target.value })}
                        placeholder="e.g. Rani Pink Chanderi Anarkali"
                        maxLength={200}
                        aria-label={`Name for row ${index + 1}`}
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <Input
                        value={row.slug}
                        onChange={(e) => patchRow(index, { slug: autoSlug(e.target.value) })}
                        placeholder={derivedSlug || "auto"}
                        className="font-mono text-xs"
                        aria-label={`Slug for row ${index + 1}`}
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <Input
                        type="number"
                        min={0}
                        value={row.basePrice}
                        onChange={(e) => patchRow(index, { basePrice: e.target.value })}
                        placeholder={shared.basePrice === "" ? "—" : String(shared.basePrice)}
                        className="tabular w-28 text-right"
                        aria-label={`Price for row ${index + 1}`}
                      />
                    </td>
                    <td className="tabular py-1.5 pr-3 text-right text-ink-700">
                      {filledRow ? money(Math.round(base * (100 - percent)) / 100) : "—"}
                    </td>
                    <td className="py-1.5 pr-3">
                      <RowPhotos
                        files={row.photos}
                        disabled={!filledRow}
                        label={`row ${index + 1}`}
                        onOpen={() => setPhotoRow(index)}
                      />
                    </td>
                    <td className="py-1.5 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove row ${index + 1}`}
                        disabled={rows.length === 1}
                        onClick={() => setRows((c) => c.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="size-3.5 text-ink-400" aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="bg-ink-900 text-white ring-ink-900">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
          <Summary label="Products" value={number(filled.length)} highlight />
          <Summary label="Sizes each" value={number(sizes.length)} />
          <Summary label="Photographs" value={number(totalPhotos)} />
          <Summary label="Offer" value={percent > 0 ? `${percent}%` : "None"} />
          <Summary
            label="Status"
            value={<Badge tone={shared.active ? "green" : "slate"}>{shared.active ? "Live" : "Draft"}</Badge>}
          />
          <div className="ml-auto text-right">
            <p className="text-[11px] text-white/60">Combined shelf value</p>
            <p className="tabular text-lg font-semibold">{money(totalValue)}</p>
          </div>
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <p className="text-xs text-ink-500">
            {filled.length
              ? `Will create ${filled.length} product${filled.length === 1 ? "" : "s"} in one request.`
              : "Name at least one product."}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <LinkButton variant="ghost" href="/admin/products">
              Cancel
            </LinkButton>
            <Button variant="primary" size="lg" busy={busy} disabled={!ready} onClick={submit}>
              Upload {filled.length || ""} product{filled.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      </div>

      <Modal
        open={photoRow !== null}
        onClose={() => setPhotoRow(null)}
        size="lg"
        title={
          photoRow === null
            ? "Photographs"
            : `Photographs — ${rows[photoRow]?.name?.trim() || `row ${photoRow + 1}`}`
        }
        description="Chosen now, uploaded once the products are created. The first is the cover."
        footer={
          <Button variant="primary" onClick={() => setPhotoRow(null)}>
            Done
          </Button>
        }
      >
        {photoRow === null ? null : (
          <StagedGallery
            files={rows[photoRow].photos}
            onChange={(photos) => patchRow(photoRow, { photos })}
            disabled={busy}
          />
        )}
      </Modal>
    </div>
  );
}

/**
 * A row's photographs, as a table cell.
 *
 * Shows the cover and a count rather than the gallery itself — the
 * point here is to confirm at a glance that the right files landed on
 * the right row; managing them is the modal's job.
 *
 * The object URL is created for the cover alone and revoked when it
 * changes, so a twenty-row batch does not pin twenty files in memory
 * for the sake of twenty thumbnails.
 */
function RowPhotos({ files, onOpen, disabled, label }) {
  const cover = files[0] ?? null;

  const preview = useMemo(
    () => (cover ? URL.createObjectURL(cover) : null),
    [cover],
  );

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      title={disabled ? "Name this product first" : undefined}
      className={cx(
        "flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs transition-colors",
        disabled
          ? "cursor-not-allowed text-ink-300"
          : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
      )}
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt=""
          className="size-8 shrink-0 rounded object-cover ring-1 ring-ink-900/10"
        />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded bg-ink-100 text-ink-400">
          <ImagePlus className="size-3.5" aria-hidden="true" />
        </span>
      )}
      <span className="whitespace-nowrap">
        {files.length === 0 ? "Add" : `${files.length} photo${files.length === 1 ? "" : "s"}`}
      </span>
      <span className="sr-only">for {label}</span>
    </button>
  );
}

function Summary({ label, value, highlight }) {
  return (
    <div>
      <p className="text-[11px] tracking-wide text-white/60 uppercase">{label}</p>
      <p className={cx("tabular mt-0.5 text-xl font-semibold", highlight && "text-gold-300")}>
        {value}
      </p>
    </div>
  );
}
