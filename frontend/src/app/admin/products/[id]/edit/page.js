"use client";

import { ArrowLeft } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { DeleteDialog } from "@/components/admin/DeleteDialog";
import { DiscountDialog } from "@/components/admin/DiscountDialog";
import { ImageManager } from "@/components/admin/ImageManager";
import { StockPill } from "@/components/admin/ProductBits";
import { ColourSwatch } from "@/components/admin/ProductThumb";
import { AttributeFields, DetailsFields, PricingFields } from "@/components/admin/ProductFields";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  cx,
  ErrorNotice,
  Input,
  LinkButton,
  SkeletonRows,
  Toggle,
  useToast,
} from "@/components/admin/ui";
import { VariantMatrix } from "@/components/admin/VariantMatrix";
import {
  addProductImages,
  addVariants,
  getBootstrap,
  getProduct,
  removeImage,
  reorderImages,
  setPrimaryImage,
  updateImage,
  updateProduct,
  updateVariant,
} from "@/lib/api/products";
import { money } from "@/lib/format";

const TABS = [
  { key: "details", label: "Details", requirement: "F-03.05" },
  { key: "pricing", label: "Price & offer", requirement: "F-03.12" },
  { key: "variants", label: "Variants", requirement: "F-03.03" },
  { key: "images", label: "Images", requirement: "F-03.06" },
];

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
  const [product, setProduct] = useState(null);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const formSeededFor = useRef(null);

  useEffect(() => {
    let active = true;
    Promise.all([getProduct(id), getBootstrap()])
      .then(([fetched, ref]) => {
        if (!active) return;
        setLoaded({ product: fetched, reference: ref, error: null });
        setProduct(fetched);
        // Seed the form once per product. Later reloads (a saved variant, a new
        // image) must not discard edits the admin has typed but not saved.
        if (formSeededFor.current !== fetched.id) {
          formSeededFor.current = fetched.id;
          setForm({
            name: fetched.name,
            slug: fetched.slug,
            description: fetched.description,
            category_id: String(fetched.category_id),
            size_chart_id: fetched.size_chart_id ? String(fetched.size_chart_id) : "",
            fit: fetched.fit || "",
            base_price: fetched.base_price,
            discount_percent: fetched.discount_percent,
            is_active: fetched.is_active,
            is_featured: fetched.is_featured,
            attributes: fetched.attributes || {},
          });
        }
      })
      .catch((err) => {
        if (active) setLoaded((current) => ({ ...current, error: err }));
      });
    return () => {
      active = false;
    };
  }, [id, reload]);

  const load = useCallback(() => setReload((n) => n + 1), []);
  const reference = loaded.reference;
  const error = loaded.error;

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      const updated = await updateProduct(product.id, form);
      setProduct(updated);
      toast.success("Product saved.");
    } catch (err) {
      if (err.fields) setErrors(err.fields);
      toast.error(err.message || "Save failed.");
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
            {product.stock.variant_count} variants · {product.images.length} images ·{" "}
            {product.ordered_units} units ordered to date
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={form.is_active ? "green" : "slate"}>{form.is_active ? "Live" : "Hidden"}</Badge>
          <Toggle
            checked={form.is_active}
            onChange={(value) => setField("is_active", value)}
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
              "-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-sm font-medium transition-colors",
              tab === item.key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-800",
            )}
          >
            {item.label}
            <span className="font-mono text-[10px] text-ink-300">{item.requirement}</span>
          </button>
        ))}
      </div>

      {tab === "details" ? (
        <>
          <Card>
            <CardHeader title="Product details" requirement="F-03.05" />
            <div className="p-5">
              <DetailsFields form={form} setField={setField} errors={errors} reference={reference} />
            </div>
          </Card>
          <Card>
            <CardHeader
              title="Attributes"
              requirement="F-03.09"
              description="Only values approved in the attribute register appear here."
            />
            <div className="p-5">
              <AttributeFields form={form} setField={setField} reference={reference} />
            </div>
          </Card>
          <SaveBar saving={saving} onSave={save} productId={product.id} />
        </>
      ) : null}

      {tab === "pricing" ? (
        <>
          <Card>
            <CardHeader title="Price & offer" requirement="F-03.08" />
            <div className="p-5">
              <PricingFields form={form} setField={setField} errors={errors} />
            </div>
          </Card>
          <VariantOverrides product={product} onDone={load} />
          <SaveBar saving={saving} onSave={save} productId={product.id} />
        </>
      ) : null}

      {tab === "variants" ? (
        <VariantsTab product={product} reference={reference} onDone={load} />
      ) : null}

      {tab === "images" ? <ImagesTab product={product} onDone={load} /> : null}
    </div>
  );
}

function SaveBar({ saving, onSave, productId }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur lg:left-64">
      <div className="mx-auto flex max-w-5xl items-center justify-end gap-2 px-4 py-3 sm:px-6">
        <LinkButton variant="ghost" href={`/admin/products/${productId}`}>
          Cancel
        </LinkButton>
        <Button variant="primary" size="lg" busy={saving} onClick={onSave}>
          Save changes
        </Button>
      </div>
    </div>
  );
}

/** F-03.12 at variant granularity — the "or variant" half of the requirement. */
function VariantOverrides({ product, onDone }) {
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);

  async function clearOverride(variant) {
    setBusyId(variant.id);
    try {
      await updateVariant(variant.id, {
        ...variant,
        price_override: null,
        discount_percent_override: null,
      });
      toast.success(`${variant.sku} now inherits the product price.`);
      await onDone();
    } catch (err) {
      toast.error(err.message || "Could not clear the override.");
    } finally {
      setBusyId(null);
    }
  }

  const overridden = product.variants.filter((v) => v.pricing.has_override);

  return (
    <Card>
      <CardHeader
        title="Variant price overrides"
        requirement="F-03.12"
        description="Blank means inherit. Overrides exist so one size — XXL, say — can be priced differently without splitting the product."
      />
      {overridden.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-500">
          No variant overrides. Every variant sells at{" "}
          <strong className="text-ink-800">{money(product.sale_price)}</strong>. Set an override from the
          Variants tab.
        </p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {overridden.map((variant) => (
            <li key={variant.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="font-mono text-[11px] text-ink-600">{variant.sku}</span>
              <ColourSwatch hex={variant.colour_hex} name={`${variant.size} · ${variant.colour}`} />
              <span className="tabular ml-auto text-sm font-semibold text-ink-900">
                {money(variant.pricing.sale_price)}
              </span>
              {variant.pricing.discount_percent > 0 ? (
                <Badge tone="brand">−{variant.pricing.discount_percent}%</Badge>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                busy={busyId === variant.id}
                onClick={() => clearOverride(variant)}
              >
                Clear override
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function VariantsTab({ product, reference, onDone }) {
  const toast = useToast();
  const [newRows, setNewRows] = useState([]);
  const [variantErrors, setVariantErrors] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [dialog, setDialog] = useState(null);

  function draftFor(variant) {
    return drafts[variant.id] ?? {
      stock_quantity: variant.stock_quantity,
      price_override: variant.price_override ?? "",
      discount_percent_override: variant.discount_percent_override ?? "",
    };
  }

  function patchDraft(variant, patch) {
    setDrafts((current) => ({ ...current, [variant.id]: { ...draftFor(variant), ...patch } }));
  }

  const dirty = (variant) => {
    const draft = draftFor(variant);
    return (
      Number(draft.stock_quantity) !== variant.stock_quantity ||
      String(draft.price_override) !== String(variant.price_override ?? "") ||
      String(draft.discount_percent_override) !== String(variant.discount_percent_override ?? "")
    );
  };

  async function saveVariant(variant) {
    setBusyId(variant.id);
    try {
      await updateVariant(variant.id, { ...variant, ...draftFor(variant) });
      setDrafts((current) => {
        const next = { ...current };
        delete next[variant.id];
        return next;
      });
      toast.success(`${variant.sku} updated.`);
      await onDone();
    } catch (err) {
      toast.error(err.message || "Could not save the variant.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleVariantActive(variant) {
    setBusyId(variant.id);
    try {
      await updateVariant(variant.id, { ...variant, is_active: !variant.is_active });
      toast.success(`${variant.sku} ${variant.is_active ? "deactivated" : "activated"}.`);
      await onDone();
    } catch (err) {
      toast.error(err.message || "Could not change the variant.");
    } finally {
      setBusyId(null);
    }
  }

  async function addRows() {
    setAdding(true);
    setVariantErrors([]);
    try {
      const created = await addVariants(product.id, newRows);
      toast.success(`${created.length} variant${created.length === 1 ? "" : "s"} added.`);
      setNewRows([]);
      await onDone();
    } catch (err) {
      if (err.fields?.variants) setVariantErrors(err.fields.variants);
      toast.error(err.message || "Could not add the variants.");
    } finally {
      setAdding(false);
    }
  }

  function toggleSelect(variantId) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  }

  const selectedVariants = product.variants.filter((v) => selected.has(v.id));

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={`${product.variants.length} variants`}
          requirement="F-03.03"
          description="Stock and per-variant pricing. Edit a cell and the row's Save appears."
          actions={
            selectedVariants.length ? (
              <>
                <Badge tone="brand">{selectedVariants.length} selected</Badge>
                <Button size="sm" variant="secondary" onClick={() => setDialog("discount")}>
                  Discount…
                </Button>
                <Button size="sm" variant="danger" onClick={() => setDialog("delete")}>
                  Delete…
                </Button>
              </>
            ) : null
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/60 text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                <th className="w-10 px-4 py-2.5" />
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Size / colour</th>
                <th className="px-4 py-2.5 text-right">Stock</th>
                <th className="px-4 py-2.5 text-right">Price override</th>
                <th className="px-4 py-2.5 text-right">Disc. %</th>
                <th className="px-4 py-2.5 text-right">Sells at</th>
                <th className="px-4 py-2.5">Active</th>
                <th className="px-4 py-2.5 text-right">Save</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {product.variants.map((variant) => {
                const draft = draftFor(variant);
                const changed = dirty(variant);
                return (
                  <tr key={variant.id} className={cx(changed && "bg-gold-50/60")}>
                    <td className="px-4 py-2">
                      <Checkbox
                        checked={selected.has(variant.id)}
                        onChange={() => toggleSelect(variant.id)}
                        aria-label={`Select ${variant.sku}`}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-mono text-[11px] text-ink-600">{variant.sku}</span>
                      {variant.order_line_count > 0 ? (
                        <span
                          title={`On ${variant.order_line_count} order lines — cannot be deleted`}
                          className="ml-1.5"
                        >
                          🔒
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">
                      <ColourSwatch hex={variant.colour_hex} name={`${variant.size} · ${variant.colour}`} />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min={0}
                        value={draft.stock_quantity}
                        onChange={(e) => patchDraft(variant, { stock_quantity: e.target.value })}
                        className="tabular h-8 w-24 px-2 py-0 text-right"
                        aria-label={`Stock for ${variant.sku}`}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min={0}
                        placeholder={String(product.base_price)}
                        value={draft.price_override}
                        onChange={(e) => patchDraft(variant, { price_override: e.target.value })}
                        className="tabular h-8 w-28 px-2 py-0 text-right"
                        aria-label={`Price override for ${variant.sku}`}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        placeholder={String(product.discount_percent)}
                        value={draft.discount_percent_override}
                        onChange={(e) =>
                          patchDraft(variant, { discount_percent_override: e.target.value })
                        }
                        className="tabular h-8 w-20 px-2 py-0 text-right"
                        aria-label={`Discount override for ${variant.sku}`}
                      />
                    </td>
                    <td className="tabular px-4 py-2 text-right">
                      <div className="font-semibold text-ink-900">{money(variant.pricing.sale_price)}</div>
                      <StockPill status={variant.stock_status} />
                    </td>
                    <td className="px-4 py-2">
                      <Toggle
                        checked={variant.is_active}
                        onChange={() => toggleVariantActive(variant)}
                        disabled={busyId === variant.id}
                        label={`Toggle ${variant.sku}`}
                        size="sm"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      {changed ? (
                        <Button
                          size="sm"
                          variant="primary"
                          busy={busyId === variant.id}
                          onClick={() => saveVariant(variant)}
                        >
                          Save
                        </Button>
                      ) : (
                        <span className="text-[11px] text-ink-300">saved</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Add variants"
          requirement="F-03.03"
          description="Existing size / colour combinations are skipped — the pair is unique per product."
          actions={
            newRows.length ? (
              <Button size="sm" variant="primary" busy={adding} onClick={addRows}>
                Add {newRows.length} variant{newRows.length === 1 ? "" : "s"}
              </Button>
            ) : null
          }
        />
        <div className="p-5">
          <VariantMatrix
            rows={newRows}
            onChange={setNewRows}
            attributes={reference?.attributes}
            categoryId={product.category_id}
            productId={product.id}
            basePrice={product.base_price}
            discountPercent={product.discount_percent}
            errors={variantErrors}
          />
        </div>
      </Card>

      <DiscountDialog
        open={dialog === "discount"}
        onClose={() => setDialog(null)}
        targets={{ products: [], variants: selectedVariants }}
        onDone={async () => {
          setSelected(new Set());
          await onDone();
        }}
      />
      <DeleteDialog
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        targets={{ products: [], variants: selectedVariants }}
        onDone={async () => {
          setSelected(new Set());
          await onDone();
        }}
      />
    </div>
  );
}

function ImagesTab({ product, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function guard(work, message) {
    setBusy(true);
    try {
      await work();
      if (message) toast.success(message);
      await onDone();
    } catch (err) {
      toast.error(err.message || "Image operation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Images"
        requirement="F-03.06"
        description="Gallery images are shared; variant-bound images swap in when a shopper picks that colour."
      />
      <div className="p-5">
        <ImageManager
          images={product.images}
          variants={product.variants}
          busy={busy}
          onAdd={(specs) => guard(() => addProductImages(product.id, specs), `${specs.length} image(s) added.`)}
          onRemove={(image) => guard(() => removeImage(image.id), "Image removed.")}
          onSetPrimary={(image) => guard(() => setPrimaryImage(image.id), "Primary image updated.")}
          onAssign={(image, value) =>
            guard(
              () => updateImage(image.id, { variant_id: value === "" ? null : value }),
              value === "" ? "Moved to the product gallery." : "Attached to the variant.",
            )
          }
          onAltChange={(image, alt) => updateImage(image.id, { alt_text: alt }).then(onDone)}
          onReorder={(image, delta) => {
            const siblings = product.images
              .filter((i) => (i.variant_id === null) === (image.variant_id === null))
              .sort((a, b) => a.display_order - b.display_order);
            const index = siblings.findIndex((i) => i.id === image.id);
            const target = index + delta;
            if (target < 0 || target >= siblings.length) return;
            const ordered = [...siblings];
            [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
            guard(() => reorderImages(product.id, ordered.map((i) => i.id)));
          }}
        />
      </div>
    </Card>
  );
}
