"use client";

import { ArrowLeft, Check, Circle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  AttributeFields,
  DetailsFields,
  PricingFields,
  validateProductForm,
} from "@/components/admin/ProductFields";
import { StagedGallery } from "@/components/admin/ProductGallery";
import { SizeStockEditor } from "@/components/admin/SizeStockEditor";
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
import { listAttributeValues, listColours } from "@/lib/api/attributes";
import { uploadImages } from "@/lib/api/images";
import { createProduct, getReference } from "@/lib/api/products";
import { listFits } from "@/lib/api/sizeCharts";
import { replaceVariants } from "@/lib/api/variants";
import { autoSlug } from "@/lib/slug";
import {
  hasErrors,
  summarizeErrors,
  validateBasePrice,
  validateSalePrice,
  validateVariantRows,
} from "@/lib/validate";

const BLANK = {
  name: "",
  slug: "",
  description: "",
  categoryId: "",
  subCategoryId: "",
  basePrice: "",
  discountPercentage: 0,
  attributes: {},
  isFeatured: false,
  active: true,
};

/**
 * The size run most products start from — editable before saving.
 *
 * Colourless, because most products are: choosing a colourway on the
 * form converts these rows rather than adding beside them, so starting
 * with one would presume an answer the admin has not given.
 */
const DEFAULT_SIZES = ["36", "38", "40", "42"].map((size) => ({
  size,
  colour: "",
  stockQuantity: 0,
  active: true,
}));

export default function NewProductPage() {
  const router = useRouter();
  const toast = useToast();

  const [reference, setReference] = useState(null);
  const [attributeGroups, setAttributeGroups] = useState({});
  const [fits, setFits] = useState([]);
  const [colours, setColours] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [sizes, setSizes] = useState(DEFAULT_SIZES);
  // Held in the browser until the product exists — photographs are keyed
  // by product id, so there is nothing to upload them against yet.
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);

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

    // The Fit picker, filled from the published size charts rather than
    // the register — a fit exists because a chart is published for it.
    // A failed read leaves the picker empty and the product fitless,
    // which is the "shows every chart" case and not a broken form.
    listFits({ signal: controller.signal })
      .then(setFits)
      .catch(() => {});

    // The colour chips on the size matrix. An empty or failed register
    // leaves the matrix working — a colour can still be registered
    // inline, and a product need not have one at all.
    listColours({ signal: controller.signal })
      .then(setColours)
      .catch(() => {});

    return () => controller.abort();
  }, []);

  // Re-read after a value is registered inline, so the new option is
  // present on the other dropdowns too. Only fills the dropdowns, so a
  // failure here never blocks the form.
  /**
   * Re-reads the register after a value is added inline, so the new
   * option shows up on the other dropdowns too.
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

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function submit() {
    setFailure(null);

    // The whole form is checked before the first of three requests goes
    // out. That ordering matters here more than on most screens: creating
    // a product writes the row, then its sizes, then its photographs, and
    // a validation failure on the first leaves nothing behind — whereas a
    // failure discovered later can leave a product with no sizes on it.
    const invalid = validateProductForm(form);

    if (hasErrors(invalid)) {
      setErrors(invalid);
      toast.error("Check the product details", summarizeErrors(invalid));
      return;
    }

    // The matrix is the second of the three requests. Refused now rather
    // than then: a product written with no sizes on it is the awkward
    // half-finished state this whole ordering exists to avoid.
    const badRow = validateVariantRows(sizes);

    if (badRow) {
      toast.error("Check the size matrix", badRow);
      return;
    }

    setBusy(true);
    setErrors({});
    try {
      const product = await createProduct({
        ...form,
        slug: form.slug || autoSlug(form.name),
      });

      // Sizes are a second call: they live in their own table and need
      // the product id, which only exists once the row above is written.
      if (sizes.length) {
        try {
          await replaceVariants(product.id, sizes);
        } catch (variantError) {
          // The product itself saved — say so plainly rather than
          // implying nothing happened, and send them to the edit screen
          // where the sizes can be retried.
          toast.error(
            `"${product.name}" was created, but its sizes and colours were not saved.`,
            variantError.message,
          );
          router.push(`/admin/products/${product.id}/edit?tab=sizes`);
          return;
        }
      }

      // Photographs are a third call, for the same reason sizes are a
      // second one: they are keyed by product id.
      if (photos.length) {
        try {
          await uploadImages(product.id, photos);
        } catch (imageError) {
          toast.error(
            `"${product.name}" was created, but its photographs were not uploaded.`,
            imageError.message,
          );
          router.push(`/admin/products/${product.id}/edit?tab=photos`);
          return;
        }
      }

      const added = [
        sizes.length ? describeMatrix(sizes) : null,
        photos.length ? `${photos.length} image${photos.length === 1 ? "" : "s"}` : null,
      ].filter(Boolean);

      toast.success(
        `"${product.name}" created.`,
        added.length ? `${added.join(" and ")} added.` : undefined,
      );
      router.push(`/admin/products/${product.id}`);
    } catch (err) {
      if (err.fields) setErrors(err.fields);
      setFailure(err);
      toast.error(err.message || "Could not create the product.");
      setBusy(false);
    }
  }

  if (!reference && !failure) return <SkeletonRows rows={10} className="mx-auto max-w-4xl" />;

  const readyDetails = Boolean(form.name && form.categoryId);

  // `>= 0` used to be enough here, which let a product through at ₹0 —
  // a Buy button for nothing. The full rule, so the checklist at the
  // bottom of the page agrees with what submitting will actually accept.
  const readyPricing =
    !validateBasePrice(form.basePrice) &&
    !validateSalePrice(form.basePrice, form.discountPercentage);

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">Add product</h1>
          <p className="mt-1 text-sm text-ink-500">
            Written straight to the catalogue. The slug must be unique — the database enforces it.
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
          description="Identity, description and where the product sits in the catalogue."
        />
        <div className="p-5">
          <DetailsFields form={form} setField={setField} errors={errors} reference={reference} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Price & availability"
          description="What the product lists at, and whether shoppers can see it."
        />
        <div className="p-5">
          <PricingFields form={form} setField={setField} errors={errors} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Photographs"
          description="Uploaded once the product is created. The first image becomes the cover."
        />
        <div className="p-5">
          <StagedGallery files={photos} onChange={setPhotos} disabled={busy} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Sizes, colours & stock"
          description="The sellable rows. Each size in each colourway carries its own stock count."
        />
        <div className="p-5">
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

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="text-xs text-ink-500">
            <Requirement met={readyDetails} label="Name & category" />
            <Requirement met={readyPricing} label="Base price" />
            <Requirement met={sizes.length > 0} label={describeMatrix(sizes)} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LinkButton variant="ghost" href="/admin/products">
              Cancel
            </LinkButton>
            <Button
              variant="primary"
              size="lg"
              busy={busy}
              disabled={!readyDetails || !readyPricing}
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

/**
 * "4 sizes", or "4 sizes in 2 colours".
 *
 * Colours are named only when there are any, so a shop that does not
 * sell by colour never reads about a dimension it has no use for.
 */
function describeMatrix(rows) {
  const sizes = new Set(rows.map((row) => row.size));
  const colours = new Set(rows.map((row) => row.colour).filter(Boolean));

  const sizePart = `${sizes.size} size${sizes.size === 1 ? "" : "s"}`;

  return colours.size
    ? `${sizePart} in ${colours.size} colour${colours.size === 1 ? "" : "s"}`
    : sizePart;
}

function Requirement({ met, label }) {
  return (
    <span className="mr-3 inline-flex items-center gap-1">
      <span className={cx("inline-flex", met ? "text-emerald-600" : "text-ink-400")}>
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
