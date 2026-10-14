"use client";

import { ArrowLeft, ImagePlus, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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
import { listAttributeValues, listColours } from "@/lib/api/attributes";
import { uploadImages } from "@/lib/api/images";
import { bulkCreateProducts, getReference, listAllProducts } from "@/lib/api/products";
import { listFits } from "@/lib/api/sizeCharts";
import { replaceVariants } from "@/lib/api/variants";
import { money, number } from "@/lib/format";
import { autoSlug } from "@/lib/slug";
import {
  calculateSalePrice,
  MIN_PRICE,
  validateBasePrice,
  validateDiscountPercentage,
  validateProductName,
  validateSalePrice,
  validateSlug,
  validateVariantRows,
} from "@/lib/validate";

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
  description: "",
  basePrice: "",
  discountPercentage: 0,
  attributes: {},
  isFeatured: false,
  active: true,
};

/** Applied to every product in the batch. */
const DEFAULT_SIZES = ["36", "38", "40", "42"].map((size) => ({
  size,
  colour: "",
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
  const [colours, setColours] = useState([]);
  const [fits, setFits] = useState([]);
  const [shared, setShared] = useState(BLANK_SHARED);
  const [sizes, setSizes] = useState(DEFAULT_SIZES);
  const [rows, setRows] = useState(() => [makeRow(), makeRow(), makeRow()]);
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);

  // Which row's gallery is open. A modal rather than a gallery inside
  // the cell: eight thumbnails do not belong in a table row, and the
  // create screen's StagedGallery already does the job properly.
  const [photoRow, setPhotoRow] = useState(null);
  // Slugs already in the catalogue, so a clash is named against its row
  // before anything is sent. A courtesy: null (not loaded, or the walk
  // failed) skips the check, and the API's own 409 still names the row.
  const [takenSlugs, setTakenSlugs] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    getReference({ signal: controller.signal })
      .then(setReference)
      .catch((err) => {
        if (err?.name !== "AbortError") setFailure(err);
      });

    listAllProducts({ signal: controller.signal })
      .then((products) => setTakenSlugs(new Set(products.map((p) => p.slug))))
      .catch(() => {});

    // Fills the attribute dropdowns. An empty or failed register still
    // lets the form save, and a value can be added inline.
    listAttributeValues({ activeOnly: true, signal: controller.signal })
      .then(setAttributeGroups)
      .catch(() => {});

    // The Fit picker, from the published size charts — as on the single
    // create screen. Shared like the other attributes, so the fit chosen
    // here is recorded on every product in the batch.
    listFits({ signal: controller.signal })
      .then(setFits)
      .catch(() => {});

    // The colour chips on the size matrix. The whole batch shares one
    // matrix, so a colourway chosen here is given to every product in it.
    listColours({ signal: controller.signal })
      .then(setColours)
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

  /** The same, for a colour registered from the size matrix. */
  async function refreshColours() {
    try {
      setColours(await listColours());
    } catch {
      // Swatches only. The colour is already on the batch either way.
    }
  }

  /**
   * Re-reads the published fits when the shop comes back from adding one
   * in another tab. Dropdown options only, so a failure is never surfaced.
   */
  const refreshFits = useCallback(async () => {
    try {
      setFits(await listFits());
    } catch {
      // The picker keeps the list it had.
    }
  }, []);

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

  const percent = Number(shared.discountPercentage) || 0;

  /** What a row will actually be sent as — its own price, or the shared one. */
  const priceFor = (row) => (row.basePrice === "" ? shared.basePrice : row.basePrice);

  const totalValue = filled.reduce(
    (sum, row) => sum + calculateSalePrice(priceFor(row), percent),
    0,
  );

  const totalPhotos = filled.reduce((sum, row) => sum + row.photos.length, 0);

  /**
   * What a row shows beside its inputs. Shared by the table and the phone
   * cards, so the two layouts cannot disagree about a row.
   *
   * `sells` is the API's own arithmetic. A row that would sell for nothing
   * shows its ₹0 in red rather than sitting in the column looking like
   * every other figure.
   */
  const rowView = (row) => {
    const filledRow = Boolean(row.name.trim());
    const sells = calculateSalePrice(priceFor(row), percent);
    return {
      derivedSlug: row.slug.trim() || autoSlug(row.name),
      filledRow,
      sells,
      sellsTone: filledRow && sells < MIN_PRICE ? "font-semibold text-red-600" : "text-ink-700",
    };
  };

  const removeRow = (index) => setRows((c) => c.filter((_, i) => i !== index));

  /**
   * What is wrong with the batch, as one sentence naming the row.
   *
   * Every rule the single-product screen applies, run over each row —
   * this screen writes straight to `bulkCreateProducts`, which inserts
   * the lot in one statement, so a row the API refuses takes the whole
   * batch down with it and the shop has to work out which of forty rows
   * it was. Worth naming here.
   *
   * The price rules are the ones this screen was loosest about: `ready`
   * asked only for `Number(base) >= 0`, so a row at ₹0 — or a shared 100%
   * discount over every row — uploaded as a catalogue full of free
   * products.
   */
  const batchProblem = (() => {
    if (!shared.categoryId) return "Pick a category for the batch";
    if (filled.length === 0) return "Fill in at least one row";
    if (duplicateSlug) return "Two rows would have the same URL slug";

    const sharedDiscount = validateDiscountPercentage(shared.discountPercentage);
    if (sharedDiscount) return sharedDiscount;

    for (const [index, row] of filled.entries()) {
      const where = `Row ${index + 1}`;
      const name = row.name.trim();

      const problem =
        validateProductName(name) ??
        validateSlug(row.slug.trim() || autoSlug(name), { label: "URL slug" }) ??
        validateBasePrice(priceFor(row)) ??
        validateSalePrice(priceFor(row), shared.discountPercentage);

      if (problem) return `${where} (${name}): ${problem}`;

      const slug = row.slug.trim() || autoSlug(name);
      if (takenSlugs?.has(slug)) {
        return `${where} (${name}): the URL slug "${slug}" is already used by another product`;
      }
    }

    return validateVariantRows(sizes);
  })();

  const ready = !batchProblem;

  async function submit() {
    // `ready` already gates the button, so this is the belt to its braces
    // — and the thing that says *why* if the button is ever reached with
    // the batch in a state it cannot go up in.
    if (batchProblem) {
      toast.error("Check the batch", batchProblem);
      return;
    }

    setBusy(true);
    setFailure(null);
    try {
      const created = await bulkCreateProducts(
        shared.categoryId,
        filled.map((row) => ({
          name: row.name,
          slug: row.slug.trim() || autoSlug(row.name),
          description: shared.description,
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
          sizes.length ? `${sizes.length} sellable row${sizes.length === 1 ? "" : "s"} each` : null,
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
      toast.error(err.message || "Bulk upload failed.", rowProblems(err.fields) ?? undefined);
      setBusy(false);
    }
  }

  /**
   * The API names a refused row by its index in the batch it was sent —
   * `products[3].slug` — which is the index into `filled`, not a key the
   * admin can see. Turned back into "Row 4 (Rani Pink Anarkali): …".
   */
  function rowProblems(fields) {
    const lines = Object.entries(fields ?? {}).map(([key, message]) => {
      const match = /^products\[(\d+)\]/.exec(key);
      const row = match ? filled[Number(match[1])] : null;

      return row ? `Row ${Number(match[1]) + 1} (${row.name.trim()}): ${message}` : message;
    });

    return lines.length ? lines.join(" · ") : null;
  }

  if (!reference && !failure) return <SkeletonRows rows={10} className="mx-auto max-w-5xl" />;

  return (
    // The bottom bar is taller on a phone, where its status line sits above
    // the buttons, so the page leaves more room under it.
    <div className="mx-auto max-w-5xl space-y-5 pb-40 sm:pb-24">
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
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2">
          <Field label="Category" required hint="One category for the whole batch.">
            <Select
              value={shared.categoryId}
              onChange={(e) => setSharedField("categoryId", e.target.value)}
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

          <Field
            label="Base price (₹)"
            required
            hint="A row can override this. Must be more than ₹0."
            error={validateBasePrice(shared.basePrice, false)}
          >
            <Input
              type="number"
              min={1}
              step={1}
              value={shared.basePrice}
              invalid={Boolean(validateBasePrice(shared.basePrice, false))}
              onChange={(e) => setSharedField("basePrice", e.target.value)}
              className="tabular"
              placeholder="1499"
            />
          </Field>

          <Field
            label="Discount %"
            hint="0–99, applied to every product in the batch."
            error={validateDiscountPercentage(shared.discountPercentage)}
          >
            <Input
              type="number"
              min={0}
              max={99}
              step={0.5}
              value={shared.discountPercentage}
              invalid={Boolean(validateDiscountPercentage(shared.discountPercentage))}
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
            <div className="min-w-0">
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
          title="Sizes, colours & stock"
          description="The same size run and colourways are given to every product in the batch. Stock can be corrected per product afterwards."
        />
        <div className="p-4 sm:p-5">
          <SizeStockEditor
            rows={sizes}
            onChange={setSizes}
            colours={colours}
            onRegisterColour={refreshColours}
            disabled={busy}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Attributes"
          description="Shared by the batch — fabric, work and sleeve."
        />
        <div className="p-4 sm:p-5">
          <AttributeFields
            form={shared}
            setField={setSharedField}
            groups={attributeGroups}
            fits={fits}
            onRefreshFits={refreshFits}
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
          <p className="mx-4 mt-4 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 ring-1 ring-inset ring-red-200 sm:mx-5">
            Two rows resolve to the same URL slug. Slugs are unique across the whole catalogue, so
            the upload would be rejected.
          </p>
        ) : null}

        {/* Below `md` each row is a card holding the same inputs and
            actions. The table needs 720px, and on a phone it would scroll
            sideways with no scrollbar to say so — hiding the price, the
            photos button and the remove button off the right edge. */}
        <ul className="space-y-3 p-4 md:hidden">
          {rows.map((row, index) => {
            const { derivedSlug, filledRow, sells, sellsTone } = rowView(row);

            return (
              <li
                key={row.key}
                className="space-y-3 rounded-lg p-3 ring-1 ring-inset ring-ink-200"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                    Row {index + 1}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-9 px-0"
                    aria-label={`Remove row ${index + 1}`}
                    disabled={rows.length === 1}
                    onClick={() => removeRow(index)}
                  >
                    <Trash2 className="size-4 text-ink-400" aria-hidden="true" />
                  </Button>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-600">Product name</span>
                  <Input
                    value={row.name}
                    onChange={(e) => patchRow(index, { name: e.target.value })}
                    placeholder="e.g. Rani Pink Chanderi Anarkali"
                    maxLength={200}
                    aria-label={`Name for row ${index + 1}`}
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-600">URL slug</span>
                  <Input
                    value={row.slug}
                    onChange={(e) => patchRow(index, { slug: e.target.value.toLowerCase() })}
                    onBlur={(e) => patchRow(index, { slug: autoSlug(e.target.value) })}
                    placeholder={derivedSlug || "auto"}
                    className="font-mono text-xs"
                    aria-label={`Slug for row ${index + 1}`}
                  />
                </label>

                <div className="grid grid-cols-2 items-end gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-ink-600">Price override</span>
                    <Input
                      type="number"
                      min={1}
                      value={row.basePrice}
                      invalid={Boolean(validateBasePrice(row.basePrice, false))}
                      onChange={(e) => patchRow(index, { basePrice: e.target.value })}
                      placeholder={shared.basePrice === "" ? "—" : String(shared.basePrice)}
                      className="tabular"
                      aria-label={`Price for row ${index + 1}`}
                    />
                  </label>
                  <div className="pb-2">
                    <p className="text-xs font-medium text-ink-600">Sells at</p>
                    <p className={cx("tabular text-sm", sellsTone)}>
                      {filledRow ? money(sells) : "—"}
                    </p>
                  </div>
                </div>

                <RowPhotos
                  files={row.photos}
                  label={`row ${index + 1}`}
                  onOpen={() => setPhotoRow(index)}
                />
              </li>
            );
          })}
        </ul>

        <div className="hidden overflow-x-auto p-5 md:block">
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
                const { derivedSlug, filledRow, sells, sellsTone } = rowView(row);

                return (
                  <tr key={row.key}>
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
                        onChange={(e) => patchRow(index, { slug: e.target.value.toLowerCase() })}
                        onBlur={(e) => patchRow(index, { slug: autoSlug(e.target.value) })}
                        placeholder={derivedSlug || "auto"}
                        className="font-mono text-xs"
                        aria-label={`Slug for row ${index + 1}`}
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <Input
                        type="number"
                        min={1}
                        value={row.basePrice}
                        // Blank is not wrong — it means "use the shared
                        // price" — so the row's own box is only checked
                        // once something has been typed into it.
                        invalid={Boolean(validateBasePrice(row.basePrice, false))}
                        onChange={(e) => patchRow(index, { basePrice: e.target.value })}
                        placeholder={shared.basePrice === "" ? "—" : String(shared.basePrice)}
                        className="tabular w-28 text-right"
                        aria-label={`Price for row ${index + 1}`}
                      />
                    </td>
                    <td className={cx("tabular py-1.5 pr-3 text-right", sellsTone)}>
                      {filledRow ? money(sells) : "—"}
                    </td>
                    <td className="py-1.5 pr-3">
                      <RowPhotos
                        files={row.photos}
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
                        onClick={() => removeRow(index)}
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
        {/* Three figures a row on a phone, with the total on a line of its
            own; from `sm` they flow in one line as before. */}
        <div className="grid grid-cols-3 gap-x-4 gap-y-3 p-4 sm:flex sm:flex-wrap sm:items-center sm:gap-x-8 sm:p-5">
          <Summary label="Products" value={number(filled.length)} highlight />
          <Summary label="Rows each" value={number(sizes.length)} />
          <Summary label="Photographs" value={number(totalPhotos)} />
          <Summary label="Offer" value={percent > 0 ? `${percent}%` : "None"} />
          <Summary
            label="Status"
            value={<Badge tone={shared.active ? "green" : "slate"}>{shared.active ? "Live" : "Draft"}</Badge>}
          />
          <div className="col-span-full sm:ml-auto sm:text-right">
            <p className="text-[11px] text-white/60">Combined shelf value</p>
            <p className="tabular text-lg font-semibold">{money(totalValue)}</p>
          </div>
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-3">
          {/* Why the button is off, rather than a disabled button and no
              explanation — the row at fault can be off-screen in a batch
              of forty. */}
          <p
            className={cx(
              "w-full min-w-0 text-xs break-words sm:w-auto sm:flex-1",
              batchProblem ? "text-red-600" : "text-ink-500",
            )}
          >
            {batchProblem
              ? batchProblem
              : `Will create ${filled.length} product${filled.length === 1 ? "" : "s"} in one request.`}
          </p>
          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <LinkButton
              variant="ghost"
              href="/admin/products"
              className="h-11 flex-1 sm:h-9 sm:flex-none"
            >
              Cancel
            </LinkButton>
            <Button
              variant="primary"
              size="lg"
              className="flex-1 sm:flex-none"
              busy={busy}
              disabled={!ready}
              onClick={submit}
            >
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
function RowPhotos({ files, onOpen, label }) {
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

  // A real button rather than a faint icon: it was easy to miss that a row
  // takes photographs at all. Always enabled — photos staged on an unnamed
  // row simply wait there, and an unnamed row is never uploaded anyway.
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
        files.length === 0
          ? "border border-dashed border-brand-600 bg-brand-50 text-brand-700 hover:bg-brand-100"
          : "bg-white text-ink-800 ring-1 ring-inset ring-ink-300 hover:bg-ink-50",
      )}
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt=""
          className="-ml-1.5 size-7 shrink-0 rounded object-cover ring-1 ring-ink-900/10"
        />
      ) : (
        <ImagePlus className="size-4" aria-hidden="true" />
      )}
      {files.length === 0
        ? "Add photos"
        : `${files.length} photo${files.length === 1 ? "" : "s"} · Edit`}
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
