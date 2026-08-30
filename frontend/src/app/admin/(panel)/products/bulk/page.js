"use client";

import { ArrowLeft, Plus, Trash2 } from "lucide-react";
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
  Select,
  SkeletonRows,
  Textarea,
  Toggle,
  useToast,
} from "@/components/admin/ui";
import { AttributeFields } from "@/components/admin/ProductFields";
import { SizeStockEditor } from "@/components/admin/SizeStockEditor";
import {
  bulkCreateProducts,
  getAttributeSuggestions,
  getReference,
} from "@/lib/api/products";
import { replaceVariants } from "@/lib/api/variants";
import { money, number } from "@/lib/format";
import { autoSlug } from "@/lib/slug";

/**
 * Bulk upload — many products into one category, in a single request.
 *
 * `POST /products/bulkCreateProducts` takes a shared `categoryId` and an
 * array of products, and inserts them in one statement. So the screen is
 * a shared header (category, description, price, offer, visibility) plus
 * a repeating row where only what actually differs per product is typed:
 * its name, its slug and any price override.
 *
 * A blank price on a row inherits the shared one — that is the whole
 * point of the shared header, and it keeps a twenty-row upload to twenty
 * names instead of twenty forms.
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
const makeRow = () => ({ key: `row-${++rowCounter}`, name: "", slug: "", basePrice: "" });

export default function BulkUploadPage() {
  const router = useRouter();
  const toast = useToast();

  const [reference, setReference] = useState(null);
  const [suggestions, setSuggestions] = useState({});
  const [shared, setShared] = useState(BLANK_SHARED);
  const [sizes, setSizes] = useState(DEFAULT_SIZES);
  const [rows, setRows] = useState(() => [makeRow(), makeRow(), makeRow()]);
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getReference({ signal: controller.signal })
      .then(setReference)
      .catch((err) => {
        if (err?.name !== "AbortError") setFailure(err);
      });

    getAttributeSuggestions({ signal: controller.signal })
      .then(setSuggestions)
      .catch(() => {});

    return () => controller.abort();
  }, []);

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

      if (sizeFailures) {
        toast.error(
          `${created.length} product${created.length === 1 ? "" : "s"} created, but ${sizeFailures} did not get their sizes.`,
          "Open the ones without sizes and add them from the edit screen.",
        );
      } else {
        toast.success(
          `${created.length} product${created.length === 1 ? "" : "s"} created.`,
          sizes.length
            ? `Each with ${sizes.length} size${sizes.length === 1 ? "" : "s"}.`
            : undefined,
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
            suggestions={suggestions}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Products"
          description="One row per product. Empty rows are ignored."
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
    </div>
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
