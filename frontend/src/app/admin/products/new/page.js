"use client";

import { ArrowLeft, Check, Circle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ImageManager } from "@/components/admin/ImageManager";
import { AttributeFields, DetailsFields, PricingFields } from "@/components/admin/ProductFields";
import {
  Button,
  Card,
  CardHeader,
  cx,
  ErrorNotice,
  LinkButton,
  SkeletonRows,
  useToast,
} from "@/components/admin/ui";
import { VariantMatrix } from "@/components/admin/VariantMatrix";
import { createProduct, getBootstrap } from "@/lib/api/products";
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

export default function NewProductPage() {
  const router = useRouter();
  const toast = useToast();

  const [reference, setReference] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [variants, setVariants] = useState([]);
  const [images, setImages] = useState([]);
  const [errors, setErrors] = useState({});
  const [variantErrors, setVariantErrors] = useState([]);
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getBootstrap().then(setReference).catch(setFailure);
  }, []);

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  // Images created here reference variants by row index — the service layer
  // resolves those to real variant ids once the rows are inserted.
  function addImages(specs) {
    setImages((current) => [
      ...current,
      ...specs.map((spec, i) => ({
        ...spec,
        local_id: `${Date.now()}-${i}`,
        variant_index: null,
        display_order: current.length + i,
        is_primary: current.length === 0 && i === 0,
      })),
    ]);
  }

  function removeImage(image) {
    setImages((current) => current.filter((i) => i.local_id !== image.local_id));
  }

  function assignImage(image, value) {
    setImages((current) =>
      current.map((i) =>
        i.local_id === image.local_id
          ? { ...i, variant_index: value === "" ? null : Number(value), is_primary: value === "" ? i.is_primary : false }
          : i,
      ),
    );
  }

  function setPrimary(image) {
    setImages((current) =>
      current.map((i) => ({ ...i, is_primary: i.local_id === image.local_id })),
    );
  }

  function changeAlt(image, alt) {
    setImages((current) =>
      current.map((i) => (i.local_id === image.local_id ? { ...i, alt_text: alt } : i)),
    );
  }

  function reorder(image, delta) {
    setImages((current) => {
      const sorted = [...current].sort((a, b) => a.display_order - b.display_order);
      const index = sorted.findIndex((i) => i.local_id === image.local_id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= sorted.length) return current;
      [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
      return sorted.map((i, order) => ({ ...i, display_order: order }));
    });
  }

  async function submit() {
    setBusy(true);
    setErrors({});
    setVariantErrors([]);
    setFailure(null);
    try {
      const product = await createProduct({
        ...form,
        slug: form.slug || slugify(form.name),
        variants: variants.map((v) => ({
          ...v,
          price_override: v.price_override === "" ? null : v.price_override,
          discount_percent_override:
            v.discount_percent_override === "" ? null : v.discount_percent_override,
        })),
        images: images.map((i) => ({
          alt_text: i.alt_text,
          swatch_hex: i.swatch_hex,
          swatch_seed: i.swatch_seed,
          display_order: i.display_order,
          variant_index: i.variant_index,
        })),
      });
      toast.success(`"${product.name}" created.`, `${product.variants.length} variants, ${product.images.length} images.`);
      router.push(`/admin/products/${product.id}`);
    } catch (err) {
      if (err.fields?.variants) setVariantErrors(err.fields.variants);
      if (err.fields) setErrors(err.fields);
      setFailure(err);
      toast.error(err.message || "Could not create the product.");
      setBusy(false);
    }
  }

  if (!reference && !failure) return <SkeletonRows rows={10} className="mx-auto max-w-4xl" />;

  const readyVariants = variants.length > 0;
  const readyDetails = form.name && form.category_id && form.base_price !== "";

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">Add product</h1>
          <p className="mt-1 text-sm text-ink-500">
            One product, its sellable variants and its images — created in a single transaction.
          </p>
        </div>
        <LinkButton variant="ghost" href="/admin/products">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to products
        </LinkButton>
      </div>

      {failure && !Object.keys(errors).length ? <ErrorNotice error={failure} /> : null}

      <Card>
        <CardHeader
          title="Product details"
          requirement="F-03.02"
          description="Identity, description and the category this product belongs to."
        />
        <div className="p-5">
          <DetailsFields form={form} setField={setField} errors={errors} reference={reference} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Price & availability"
          requirement="F-03.08"
          description="The list price for every variant that does not override it."
        />
        <div className="p-5">
          <PricingFields form={form} setField={setField} errors={errors} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Attributes"
          requirement="F-03.09"
          description="Only values approved in the attribute register are offered here."
        />
        <div className="p-5">
          <AttributeFields form={form} setField={setField} reference={reference} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Variants"
          requirement="F-03.03"
          description="Size × colour. Every cart line, order line and stock number points at one of these rows."
        />
        <div className="p-5">
          <VariantMatrix
            rows={variants}
            onChange={setVariants}
            attributes={reference?.attributes}
            categoryId={form.category_id}
            basePrice={form.base_price}
            discountPercent={form.discount_percent}
            errors={variantErrors}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Images"
          requirement="F-03.06"
          description="Gallery images apply to the whole product; assign one to a variant to give a colour its own photograph."
        />
        <div className="p-5">
          <ImageManager
            images={images}
            variants={variants}
            onAdd={addImages}
            onRemove={removeImage}
            onAssign={assignImage}
            onSetPrimary={setPrimary}
            onAltChange={changeAlt}
            onReorder={reorder}
            compact
          />
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="text-xs text-ink-500">
            <Requirement met={readyDetails} label="Details" />
            <Requirement met={readyVariants} label={`${variants.length} variant${variants.length === 1 ? "" : "s"}`} />
            <Requirement met={images.length > 0} label={`${images.length} image${images.length === 1 ? "" : "s"}`} optional />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LinkButton variant="ghost" href="/admin/products">
              Cancel
            </LinkButton>
            <Button
              variant="primary"
              size="lg"
              busy={busy}
              disabled={!readyDetails || !readyVariants}
              onClick={submit}
            >
              Create product
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Requirement({ met, label, optional }) {
  return (
    <span className="mr-3 inline-flex items-center gap-1">
      <span
        className={cx(
          "inline-flex",
          met ? "text-emerald-600" : optional ? "text-ink-300" : "text-ink-400",
        )}
      >
        {met ? (
          <Check className="size-3.5" aria-hidden="true" />
        ) : (
          <Circle className="size-3" aria-hidden="true" />
        )}
      </span>
      <span className={met ? "text-ink-700" : "text-ink-400"}>{label}</span>
    </span>
  );
}
