"use client";

/**
 * @file CategoryForm.js
 * @description Comprehensive Category Editor & Creation Form.
 * Organizes category management attributes across 2 tabs:
 * 1. "General Information": Name, auto-generated SEO slug, description, image upload, storefront visibility toggle.
 * 2. "Associated Products": Searchable checklist for moving products into this category.
 *
 * Size charts are not here. They are shop-wide rather than per category —
 * one set of tables published from /admin/size-charts and read by the
 * storefront from the `size_charts` table. The `categories.fits` column
 * this form used to write was never projected to the storefront, so the
 * tab that filled it published nothing.
 *
 * Every field maps onto a column the API actually stores. The banner is
 * sent as a file, not a data URL: `POST/PUT /api/categories` is multipart
 * and the backend uploads to Cloudinary itself, so the browser holds the
 * File and an object-URL preview rather than base64 in state.
 */

import {
  ArrowLeft,
  Check,
  Image as ImageIcon,
  Lock,
  Search,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ErrorNotice,
  Field,
  Input,
  Spinner,
  Textarea,
  useToast,
} from "@/components/admin/ui";
import { rejectionReason } from "@/lib/api/images";
import { money } from "@/lib/format";
import {
  collect,
  hasErrors,
  summarizeErrors,
  validateDescription,
  validateName,
} from "@/lib/validate";
import { autoSlug, SLUG_PATTERN } from "../../lib/categories/utils";
import Toggle from "./Toggle";
import CategoryBadge from "./Badge";

/**
 * CategoryForm Component
 *
 * @param {Object} props - Component properties
 * @param {Object} [props.initial] - Existing category data if in edit mode (omitted if creating new)
 * @param {Array<Object>} [props.products] - The catalogue, for the product picker
 * @param {Function} props.onSave - Async callback receiving the payload; may reject with an ApiError
 * @param {Function} props.onCancel - Callback to exit or navigate back without saving
 * @returns {JSX.Element} The rendered multi-tab category form
 */
export default function CategoryForm({ initial, products = [], onSave, onCancel }) {
  const toast = useToast();

  /**
   * Category display name input state.
   */
  const [name, setName] = useState(initial?.name ?? "");

  /**
   * SEO-friendly URL slug for the category (e.g., 'anarkali-suits').
   */
  const [slug, setSlug] = useState(initial?.slug ?? "");

  /**
   * Customer-facing category description text.
   */
  const [description, setDescription] = useState(initial?.description ?? "");

  /**
   * Storefront visibility flag (true = active/published, false = draft/hidden).
   */
  const [active, setActive] = useState(initial?.active ?? true);

  /**
   * Product IDs checked in the picker. Seeded with whatever the API
   * already reports in this category.
   */
  const [selectedProductIds, setSelectedProductIds] = useState(
    initial?.productIds ?? [],
  );

  /**
   * Active tab identifier: 'general' | 'products'.
   */
  const [activeTab, setActiveTab] = useState("general");

  /**
   * Search keyword filter for the Associated Products list.
   */
  const [productSearch, setProductSearch] = useState("");

  /**
   * The banner file staged for upload, or null when the stored image
   * (or no image at all) should be left alone.
   */
  const [imageFile, setImageFile] = useState(null);

  /**
   * In-flight save, and the error from the last one that failed.
   */
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  /**
   * `{ field: message }` from the checks this form runs itself, kept apart
   * from `saveError.fields` so a stale message from the API does not
   * outlive the field the admin has since corrected.
   */
  const [fieldErrors, setFieldErrors] = useState({});

  /**
   * Whether the admin has engaged with the slug yet — gates when its
   * validation message is allowed to appear. Editing starts touched,
   * because an existing category already has a slug to be wrong about.
   */
  const [slugTouched, setSlugTouched] = useState(Boolean(initial));

  /**
   * Preview source: an object URL for a freshly picked file, otherwise
   * the Cloudinary URL the API already holds.
   */
  const filePreview = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : null),
    [imageFile],
  );

  const preview = filePreview ?? initial?.image ?? "";

  // An object URL is a live handle on the blob; release it when the
  // selection changes or the form unmounts.
  useEffect(() => {
    if (!filePreview) return undefined;

    return () => URL.revokeObjectURL(filePreview);
  }, [filePreview]);

  /**
   * Products already sitting in this category. They cannot be unchecked:
   * `products.category_id` is NOT NULL, so a product always belongs to
   * exactly one category and leaving this one means joining another.
   */
  const lockedIds = useMemo(
    () => new Set(initial?.productIds ?? []),
    [initial],
  );

  /**
   * Updates category name and automatically derives an updated URL slug
   * when creating a new category. For existing categories, preserves custom slugs.
   *
   * @param {string} v - New category name
   */
  const handleNameChange = (v) => {
    setName(v);
    setFieldErrors(({ name: _dropped, ...rest }) => rest);

    if (initial) return;

    const derived = autoSlug(v);
    setSlug(derived);

    // A name that yields nothing usable ("!!!", say) is a slug problem the
    // admin has to see, even though they never opened the slug field. A
    // name that slugifies cleanly leaves the field quiet.
    if (v.trim() && !derived) setSlugTouched(true);
  };

  /**
   * Stages a local graphic file for upload. Nothing is sent until save —
   * the file rides along in the multipart request.
   *
   * @param {React.ChangeEvent<HTMLInputElement>} e - File input change event
   */
  const handleImageFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Refused before it is staged rather than after it has been uploaded.
    // A 6 MB banner otherwise rides the whole multipart request up to
    // Cloudinary before multer rejects it on size — the admin waits out
    // the upload to be told it was never going to work.
    //
    // The product gallery's own check, because the category banner goes
    // through the same multer limits and two copies of "5 MB" would drift.
    const problem = rejectionReason(file);

    if (problem) {
      // Cleared so the same file can be picked again after it has been
      // resized: an <input type="file"> whose value has not changed fires
      // no second change event.
      e.target.value = "";
      setFieldErrors((current) => ({ ...current, image: problem }));
      toast.error("That image was not attached", problem);
      return;
    }

    setFieldErrors(({ image: _dropped, ...rest }) => rest);
    setImageFile(file);
  };

  /**
   * Toggles a product's association with this category.
   *
   * @param {string} pid - Product ID to link
   */
  const toggleProduct = (pid) => {
    if (lockedIds.has(pid)) return;

    setSelectedProductIds((prev) =>
      prev.includes(pid) ? prev.filter((p) => p !== pid) : [...prev, pid],
    );
  };

  /**
   * Client-side checks that mirror the API's own validators, so an
   * obviously bad slug is caught before a round trip. This gates the save
   * button from the first render — it is only the *message* that waits.
   */
  const slugError = !slug.trim()
    ? "A URL slug is required."
    : SLUG_PATTERN.test(slug.trim().toLowerCase())
      ? null
      : "Use lowercase letters, numbers and single hyphens only.";

  /**
   * An untouched field has not failed yet, it is simply blank — so a fresh
   * create form opens with its hints, not with errors it caused itself.
   * The message appears once the admin has actually engaged with the slug,
   * directly or through the name it is derived from.
   */
  const visibleSlugError = slugTouched ? slugError : null;

  const canSave = Boolean(name.trim()) && !slugError && !saving;

  /**
   * Sends the payload to the parent, which awaits the API. Failures stay
   * on the form so the admin does not lose what they typed.
   */
  const handleSave = async () => {
    if (saving) return;

    // The full set, not just the slug the button already gates on. A name
    // of one character passes `canSave` and is refused by the API, and the
    // admin has by then switched tabs twice and lost sight of the field.
    const invalid = collect([
      ["name", validateName(name)],
      ["slug", slugError],
      ["description", validateDescription(description)],
      // Only a staged file can be wrong here — a stored banner was already
      // accepted once, and `rejectionReason(null)` is about a missing pick.
      ["image", imageFile ? rejectionReason(imageFile) : null],
    ]);

    if (hasErrors(invalid)) {
      setFieldErrors(invalid);
      setSlugTouched(true);
      setActiveTab("general"); // every field above lives on that tab
      toast.error("Check the category details", summarizeErrors(invalid));
      return;
    }

    setSaving(true);
    setSaveError(null);
    setFieldErrors({});

    try {
      await onSave({
        ...(initial?.id ? { id: initial.id } : {}),
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        description,
        active,
        productIds: selectedProductIds,
        imageFile,
      });
    } catch (error) {
      setSaveError(error);
      setSaving(false);

      // The <ErrorNotice> above the tabs carries the same message, and
      // stays. The toast is for the admin whose eyes were on the button
      // they just pressed at the bottom of a long form.
      toast.error(
        initial ? "Could not save those changes" : "Could not create the category",
        summarizeErrors(error?.fields) ?? error?.message,
      );
    }
  };

  /**
   * Field-level messages the API sent back, keyed the same way the form
   * names its fields.
   */
  const apiFields = saveError?.fields ?? {};

  /**
   * Tab definitions showing a live count badge for associated products.
   */
  const tabs = [
    { id: "general", label: "General Information" },
    { id: "products", label: `Associated Products (${selectedProductIds.length})` },
  ];

  /**
   * Filtered product items matching product title or slug search.
   */
  const term = productSearch.trim().toLowerCase();
  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(term) || p.slug.toLowerCase().includes(term),
  );

  return (
    <div className="max-w-4xl space-y-6">
      {/*
        ========================================================================
        HEADER
        Back navigation button, title, and description.
        ========================================================================
      */}
      <div>
        <Button variant="ghost" size="sm" onClick={onCancel} className="-ml-2 mb-2">
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <span className="font-mono text-xs font-semibold tracking-wider text-brand-600 uppercase">
          Catalogue
        </span>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
          {initial ? `Edit Category: ${initial.name}` : "Create New Category"}
        </h1>
        <p className="mt-1 text-xs text-ink-500 sm:text-sm">
          Define category names, SEO slugs, storefront image, and linked products.
        </p>
      </div>

      {saveError ? <ErrorNotice error={saveError} /> : null}

      {/*
        ========================================================================
        TAB NAVIGATION
        Switches between General Info, Product Linkages, and Size Charts.
        ========================================================================
      */}
      <div className="flex border-b border-ink-200">
        {tabs.map((t) => {
          const isSelected = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`relative -mb-px px-4 py-2.5 text-xs font-semibold transition-colors sm:text-sm ${isSelected
                  ? "border-b-2 border-brand-600 text-brand-700 font-bold"
                  : "text-ink-500 hover:text-ink-800"
                }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/*
        ========================================================================
        TAB CONTENT PANELS
        ========================================================================
      */}
      <div>
        {/* PANEL 1: General Information */}
        {activeTab === "general" && (
          <div className="space-y-5">
            <Card className="p-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Category Name Input */}
                <Field
                  label="Category Name"
                  required
                  hint="e.g. Silk Sarees, Cotton Kurtis"
                  error={fieldErrors.name || apiFields.name}
                >
                  <Input
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Enter category name"
                    maxLength={255}
                    invalid={Boolean(fieldErrors.name || apiFields.name)}
                  />
                </Field>

                {/* SEO URL Slug */}
                <Field
                  label="URL Slug"
                  required
                  hint="Unique URI slug used in storefront URLs"
                  error={apiFields.slug || visibleSlugError}
                >
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-ink-400">
                      /
                    </span>
                    <Input
                      value={slug}
                      onChange={(e) => {
                        setSlug(e.target.value);
                        setSlugTouched(true);
                        setFieldErrors(({ slug: _dropped, ...rest }) => rest);
                      }}
                      onBlur={() => setSlugTouched(true)}
                      placeholder="e.g. silk-sarees"
                      maxLength={255}
                      className="pl-6 font-mono text-xs"
                      invalid={Boolean(apiFields.slug || visibleSlugError)}
                    />
                  </div>
                </Field>
              </div>

              {/* Description Textarea */}
              <Field
                label="Description"
                hint="Optional summary displayed on the storefront category page"
                error={fieldErrors.description || apiFields.description}
              >
                <Textarea
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setFieldErrors(({ description: _dropped, ...rest }) => rest);
                  }}
                  placeholder="Describe this category..."
                  rows={3}
                  invalid={Boolean(fieldErrors.description || apiFields.description)}
                />
              </Field>

              {/* Category Banner Image Upload Box */}
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-ink-700">
                  Category Banner Image
                </span>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="relative h-28 w-44 shrink-0 overflow-hidden rounded-lg bg-ink-100 ring-1 ring-ink-200">
                    {preview ? (
                      <>
                        <img src={preview} alt="Preview" className="h-full w-full object-cover" />
                        {/* Only a staged file can be discarded — clearing a
                            stored image is not something the API exposes. */}
                        {imageFile ? (
                          <button
                            type="button"
                            onClick={() => setImageFile(null)}
                            className="absolute right-1.5 top-1.5 rounded-full bg-ink-900/60 p-1 text-white hover:bg-ink-900 transition-colors"
                            title="Discard selected image"
                          >
                            <X className="size-3" />
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-400">
                        <ImageIcon className="size-6 stroke-[1.5]" />
                        <span className="text-[10px]">No image selected</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-brand-300 bg-brand-50/30 px-4 py-2 text-xs font-medium text-brand-700 hover:bg-brand-50 transition-colors">
                      <UploadCloud className="size-4" />
                      <span>{preview ? "Replace image" : "Upload image file"}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleImageFile}
                        className="hidden"
                      />
                    </label>
                    {fieldErrors.image ? (
                      <p role="alert" className="text-xs text-red-600">
                        {fieldErrors.image}
                      </p>
                    ) : (
                      <p className="text-[11px] leading-relaxed text-ink-400">
                        Recommended: 600×400px JPG, PNG, or WebP, up to 5 MB. Uploaded to
                        Cloudinary when you save.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* Active / Inactive Storefront Visibility Card */}
            <Card className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-semibold text-ink-900">Storefront Visibility</p>
                <p className="text-xs text-ink-500">
                  {active
                    ? "Active — visible to customers on the storefront"
                    : "Inactive — hidden from store browsing and navigation"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Toggle checked={active} onChange={() => setActive(!active)} />
                <CategoryBadge active={active} />
              </div>
            </Card>
          </div>
        )}

        {/* PANEL 2: Associated Products */}
        {activeTab === "products" && (
          <Card className="p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-ink-900">Select Products</p>
              <p className="text-xs text-ink-500">
                Checking a product moves it into this category. Products already here
                cannot be unchecked — every product belongs to exactly one category, so
                remove one by assigning it elsewhere.
              </p>
            </div>

            {/* Product search box */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400 pointer-events-none" />
              <Input
                placeholder="Search products by name or slug…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Scrollable list of products */}
            <div className="max-h-[380px] space-y-1.5 overflow-y-auto pr-1">
              {filteredProducts.map((p) => {
                const checked = selectedProductIds.includes(p.id);
                const locked = lockedIds.has(p.id);

                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-3 rounded-lg p-2.5 transition-colors ring-1 ${locked
                        ? "cursor-default bg-ink-50 ring-ink-200"
                        : checked
                          ? "cursor-pointer bg-brand-50/50 ring-brand-300"
                          : "cursor-pointer bg-white ring-ink-200 hover:bg-ink-50"
                      }`}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={locked}
                      onChange={() => toggleProduct(p.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-ink-900">{p.name}</p>
                      <p className="truncate font-mono text-[11px] text-ink-500">
                        /{p.slug} · {money(p.currentPrice)}
                      </p>
                    </div>
                    {locked ? (
                      <Badge tone="neutral" className="font-medium">
                        <Lock className="size-3" />
                        In this category
                      </Badge>
                    ) : checked ? (
                      <Badge tone="brand" className="font-medium">
                        Will move here
                      </Badge>
                    ) : null}
                  </label>
                );
              })}

              {products.length === 0 ? (
                <div className="p-8 text-center text-xs text-ink-400">
                  No products in the catalogue yet.
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="p-8 text-center text-xs text-ink-400">
                  No products matched &quot;{productSearch}&quot;
                </div>
              ) : null}
            </div>
          </Card>
        )}
      </div>

      {/*
        ========================================================================
        BOTTOM ACTION FOOTER
        Save changes / Create category and Cancel actions.
        ========================================================================
      */}
      <div className="flex items-center gap-3 border-t border-ink-200 pt-4">
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!canSave}
          className="px-5"
        >
          {saving ? <Spinner className="size-4" /> : <Check className="size-4" />}
          {saving ? "Saving…" : initial ? "Save changes" : "Create category"}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
