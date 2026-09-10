"use client";

import { ArrowLeft } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { DeleteDialog } from "@/components/admin/DeleteDialog";
import {
  AttributeFields,
  DetailsFields,
  FIELD_TAB,
  PricingFields,
  validateProductForm,
} from "@/components/admin/ProductFields";
import { ProductGallery } from "@/components/admin/ProductGallery";
import { SizeStockEditor } from "@/components/admin/SizeStockEditor";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  cx,
  ErrorNotice,
  LinkButton,
  SkeletonRows,
  Toggle,
  useToast,
} from "@/components/admin/ui";
import { listAttributeValues, listColours } from "@/lib/api/attributes";
import { getProduct, getReference, updateProduct } from "@/lib/api/products";
import { listFits } from "@/lib/api/sizeCharts";
import { getVariantsForProduct, replaceVariants } from "@/lib/api/variants";
import { shortDate } from "@/lib/format";
import { hasErrors, summarizeErrors, validateVariantRows } from "@/lib/validate";

const TABS = [
  { key: "details", label: "Details" },
  { key: "photos", label: "Photos" },
  { key: "pricing", label: "Price & offer" },
  { key: "sizes", label: "Sizes & colours" },
];

/** The variant fields the form owns — the shape replaceVariants takes. */
const toEditableRow = (variant) => ({
  size: variant.size,
  colour: variant.colour ?? "",
  stockQuantity: variant.stockQuantity,
  active: variant.active,
});

export default function EditProductPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={10} className="mx-auto max-w-5xl" />}>
      <EditProduct />
    </Suspense>
  );
}

function EditProduct() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const id = params?.id;

  const [tab, setTab] = useState(searchParams.get("tab") || "details");
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState({ product: null, reference: null, error: null });
  const [attributeGroups, setAttributeGroups] = useState({});
  const [fits, setFits] = useState([]);
  const [colours, setColours] = useState([]);
  const [form, setForm] = useState(null);
  // Sizes live in their own table, so they are their own piece of form
  // state and their own save — `null` until the first load lands.
  const [sizes, setSizes] = useState(null);
  const [savedSizes, setSavedSizes] = useState([]);
  // Photographs are their own table too, but unlike sizes every change
  // is written the moment it is made — an upload has already happened by
  // the time the admin could press Save, so pretending otherwise would
  // only invite them to "cancel" something that is already stored.
  const [images, setImages] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const formSeededFor = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    Promise.all([
      getProduct(id, { signal: controller.signal }),
      getReference({ signal: controller.signal }),
      getVariantsForProduct(id, { signal: controller.signal }).catch(() => ({
        variants: [],
      })),
    ])
      .then(([product, reference, variantResult]) => {
        if (!active) return;
        setLoaded({ product, reference, error: null });

        // The gallery rides along on the product read, so it needs no
        // request of its own.
        setImages(product.images ?? []);

        const rows = variantResult.variants.map(toEditableRow);
        setSavedSizes(rows);

        // Seed the form once per product. A later reload must not discard
        // edits the admin has typed but not saved.
        if (formSeededFor.current !== product.id) {
          formSeededFor.current = product.id;
          setSizes(rows);
          setForm({
            name: product.name,
            slug: product.slug,
            description: product.description,
            categoryId: product.categoryId,
            subCategoryId: product.subCategoryId,
            basePrice: product.basePrice,
            discountPercentage: product.discountPercentage,
            attributes: product.attributes ?? {},
            isFeatured: product.isFeatured,
            active: product.active,
          });
        }
      })
      .catch((err) => {
        if (active && err?.name !== "AbortError")
          setLoaded((current) => ({ ...current, error: err }));
      });

    // Fills the attribute dropdowns. An empty or failed register still
    // lets the form save, and a value can be added inline.
    listAttributeValues({ activeOnly: true, signal: controller.signal })
      .then(setAttributeGroups)
      .catch(() => {});

    // The Fit picker, filled from the published size charts rather than
    // the register. A failed read leaves the picker showing only the fit
    // the product already carries, which is never lost by saving.
    listFits({ signal: controller.signal })
      .then(setFits)
      .catch(() => {});

    // The colour chips on the size matrix. A failed register leaves the
    // matrix working — the product's own colours still render, from the
    // variants themselves, just without their swatches.
    listColours({ signal: controller.signal })
      .then(setColours)
      .catch(() => {});

    return () => {
      active = false;
      controller.abort();
    };
  }, [id, reload]);

  const load = useCallback(() => setReload((n) => n + 1), []);

  // Re-read after a value is registered inline. Only fills the
  // dropdowns, so a failure here never blocks the page.
  /**
   * Re-reads the register after a value is added inline, so the new
   * option shows up on the other dropdowns too. A plain function: it is
   * only passed to a child, never used as an effect dependency.
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
      // Swatches only. The colour is already on the product either way.
    }
  }
  const { product, reference, error } = loaded;

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  // Comparing against what the API last returned, so an untouched
  // Sizes tab never issues a write.
  const sizesDirty =
    sizes !== null && JSON.stringify(sizes) !== JSON.stringify(savedSizes);

  /**
   * Puts a refused field in front of the admin.
   *
   * This screen has four tabs and one Save button, so a message can land
   * on a card that is not currently rendered. Switching to the tab holding
   * the first failure is what turns "the button did nothing" into "the
   * base price is wrong".
   */
  function revealFirstError(fieldErrors) {
    const [first] = Object.keys(fieldErrors);
    const owner = FIELD_TAB[first];

    if (owner && owner !== tab) switchTab(owner);
  }

  async function save() {
    // Checked before the request, and before the sizes request behind it.
    const invalid = validateProductForm(form);

    if (hasErrors(invalid)) {
      setErrors(invalid);
      revealFirstError(invalid);
      toast.error("Check the product details", summarizeErrors(invalid));
      return;
    }

    // The matrix is its own table and its own request, so it gets its own
    // check. Refused here, because the API answers a bad row with a key
    // like `variants.2.stockQuantity` and there is no input by that name
    // for the message to appear under — the grid would simply not save.
    const badRow = sizesDirty ? validateVariantRows(sizes) : null;

    if (badRow) {
      switchTab("sizes");
      toast.error("Check the size matrix", badRow);
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      // A changed category is a separate request against a separate
      // endpoint; updateProduct handles the split.
      const updated = await updateProduct(product.id, form, {
        currentCategoryId: product.categoryId,
      });
      setLoaded((current) => ({ ...current, product: updated }));

      // The size set is a separate table and a separate request. Only
      // sent when it actually changed, so saving the details tab does
      // not rewrite every variant row.
      if (sizesDirty) {
        const result = await replaceVariants(product.id, sizes);
        const rows = result.variants.map(toEditableRow);
        setSizes(rows);
        setSavedSizes(rows);
      }

      toast.success(
        "Product saved.",
        sizesDirty ? "Details and the size matrix were both written." : undefined,
      );
    } catch (err) {
      if (hasErrors(err.fields)) {
        setErrors(err.fields);
        revealFirstError(err.fields);
      }
      toast.error(err.message || "Save failed.", summarizeErrors(err.fields) ?? undefined);
    } finally {
      setSaving(false);
    }
  }

  function switchTab(next) {
    setTab(next);
    router.replace(`/admin/products/${id}/edit?tab=${next}`, { scroll: false });
  }

  if (error && !product)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <ErrorNotice error={error} onRetry={load} />
        <LinkButton href="/admin/products">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to products
        </LinkButton>
      </div>
    );

  if (!product || !form) return <SkeletonRows rows={10} className="mx-auto max-w-5xl" />;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24">
      <nav className="flex items-center gap-1.5 text-xs text-ink-500">
        <LinkButton variant="ghost" size="sm" href="/admin/products">
          Products
        </LinkButton>
        <span aria-hidden="true">/</span>
        <LinkButton variant="ghost" size="sm" href={`/admin/products/${product.id}`}>
          {product.name}
        </LinkButton>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-ink-700">Edit</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">{product.name}</h1>
          <p className="mt-1 text-sm text-ink-500">
            Last updated {shortDate(product.updatedAt)} · created {shortDate(product.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={form.active ? "green" : "slate"}>{form.active ? "Live" : "Hidden"}</Badge>
          <Toggle
            checked={form.active}
            onChange={(value) => setField("active", value)}
            label="Publish to storefront"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-ink-200">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => switchTab(item.key)}
            className={cx(
              "-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors",
              tab === item.key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-800",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "details" ? (
        <>
          <Card>
            <CardHeader title="Product details" />
            <div className="p-5">
              <DetailsFields form={form} setField={setField} errors={errors} reference={reference} />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Attributes"
              description="Fabric, work and sleeve come from the approved-values register — add a missing one inline. The fit comes from the published size charts and decides which chart the shopper is shown."
            />
            <div className="p-5">
              <AttributeFields
                form={form}
                setField={setField}
                groups={attributeGroups}
                fits={fits}
                onRegister={refreshAttributes}
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Danger zone"
              description="Deleting is permanent. A product an order references cannot be deleted — deactivate it instead."
            />
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-sm text-ink-500">
                Remove <strong className="text-ink-800">{product.name}</strong> from the catalogue.
              </p>
              <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                Delete product…
              </Button>
            </div>
          </Card>
        </>
      ) : null}

      {tab === "photos" ? (
        <Card>
          <CardHeader
            title="Photographs"
            description="Front, back, drape, fabric. Changes here save immediately — they do not wait for the Save button."
            actions={
              images.length ? (
                <Badge tone="neutral">
                  {images.length} image{images.length === 1 ? "" : "s"}
                </Badge>
              ) : null
            }
          />
          <div className="p-5">
            <ProductGallery
              productId={product.id}
              images={images}
              onChange={setImages}
              disabled={saving}
            />
          </div>
        </Card>
      ) : null}

      {tab === "pricing" ? (
        <Card>
          <CardHeader title="Price & offer" />
          <div className="p-5">
            <PricingFields form={form} setField={setField} errors={errors} />
          </div>
        </Card>
      ) : null}

      {tab === "sizes" ? (
        <Card>
          <CardHeader
            title="Sizes & colours"
            description="Each size in each colourway is a row a shopper can buy. Removing one deletes its stock count."
            actions={sizesDirty ? <Badge tone="gold">Unsaved changes</Badge> : null}
          />
          <div className="p-5">
            {sizes === null ? (
              <SkeletonRows rows={4} />
            ) : (
              <SizeStockEditor
                rows={sizes}
                onChange={setSizes}
                colours={colours}
                onRegisterColour={refreshColours}
                disabled={saving}
              />
            )}
          </div>
        </Card>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-2 px-4 py-3 sm:px-6">
          <LinkButton variant="ghost" href={`/admin/products/${product.id}`}>
            Cancel
          </LinkButton>
          <Button variant="primary" size="lg" busy={saving} onClick={save}>
            Save changes
          </Button>
        </div>
      </div>

      <DeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        products={[product]}
        // A refused delete keeps the dialog open on its reason, so only a
        // real removal navigates away.
        onDone={(result) => {
          if (result.deleted) router.push("/admin/products");
        }}
      />
    </div>
  );
}
