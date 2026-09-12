"use client";

/**
 * Add and edit one review, on a page of its own (F-11.06).
 *
 * Mounted by `/admin/reviews/new` and `/admin/reviews/[id]/edit`. It was
 * a dialog; a page is better for what this actually is — the shop typing
 * up a paragraph a customer said on WhatsApp, with the conversation open
 * in another window. A dialog cannot be reloaded, linked to or left open
 * while something else is checked, and a stray click on its backdrop
 * takes the paragraph with it.
 *
 * The product cannot be changed once a review exists. Moving a review
 * between products would silently restate two averages at once, and
 * there is no case for it that deleting and re-adding does not cover
 * more honestly — so the picker is on the new route and the edit route
 * prints the product instead.
 *
 * The caller owns the request: `onSave` does the API call, the toast and
 * the redirect, and throws on failure. Field errors off the thrown
 * ApiError land beside the inputs they name.
 */

import { ArrowLeft, Star } from "lucide-react";
import { useMemo, useState } from "react";

import { ProductCover } from "./ProductThumb";
import {
  Button,
  Card,
  CardHeader,
  cx,
  ErrorNotice,
  Field,
  Input,
  LinkButton,
  Select,
  Textarea,
  Toggle,
  useToast,
} from "./ui";
import { hasErrors, summarizeErrors, validateReviewFields } from "@/lib/validate";

const BLANK_FORM = {
  productId: "",
  authorName: "",
  rating: 5,
  title: "",
  body: "",
  published: true,
};

export default function ReviewForm({ review, products = [], onSave, onCancel }) {
  const toast = useToast();

  const creating = !review;

  const [form, setForm] = useState(() =>
    review
      ? {
          productId: review.productId,
          authorName: review.authorName,
          rating: review.rating,
          title: review.title,
          body: review.body,
          published: review.published,
        }
      : BLANK_FORM,
  );

  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);

  /**
   * Either the ApiError from a refused save, or a `{ fields }` object from
   * the checks below. One shape, because `fieldError` reads `.fields` off
   * it either way and the inputs do not care which side refused them.
   */
  const [error, setError] = useState(null);

  // Two hundred products in one dropdown is a scroll, not a choice.
  // The filter narrows it; the cap keeps the list renderable when the
  // filter is empty.
  const options = useMemo(() => {
    const term = productSearch.trim().toLowerCase();

    const matches = term
      ? products.filter((product) =>
          `${product.name} ${product.slug}`.toLowerCase().includes(term),
        )
      : products;

    return matches.slice(0, 50);
  }, [products, productSearch]);

  const fieldError = (name) => error?.fields?.[name];

  async function submit() {
    // Editing cannot change the product, so there is no product field to
    // require — see the "A review cannot be moved" note on the form below.
    const invalid = validateReviewFields(form, { requireProduct: creating });

    if (hasErrors(invalid)) {
      setError({ fields: invalid });
      toast.error("Check the review", summarizeErrors(invalid));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave(
        creating
          ? form
          : {
              authorName: form.authorName,
              rating: form.rating,

              // Sent even when empty: "" is how the API is told to clear
              // a title the admin has just deleted out of the box.
              title: form.title,
              body: form.body,
              published: form.published,
            },
      );
      // No `setSaving(false)` on the way out: the caller is navigating,
      // and a button that flicks back to idle mid-route reads as a save
      // that did not take.
    } catch (err) {
      setError(err);
      toast.error(
        creating ? "Could not add the review" : "Could not save the review",
        summarizeErrors(err.fields) ?? err.message,
      );
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">
            {creating ? "Add a review" : "Edit review"}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            {creating
              ? "What a customer told the shop, published in their name."
              : `Published under ${review.authorName}.`}
          </p>
        </div>

        <LinkButton variant="ghost" href="/admin/reviews">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to reviews
        </LinkButton>
      </div>

      <Card>
        <CardHeader
          title="The review"
          description="Everything here except the visibility toggle is printed on the product page."
        />

        <div className="space-y-4 p-5">
          {/* Field-level messages render beside their inputs; anything
              without a field to attach to needs saying at the top. */}
          {error && Object.keys(error.fields ?? {}).length === 0 ? (
            <ErrorNotice error={error} />
          ) : null}

          {creating ? (
            <Field
              label="Product"
              required
              error={fieldError("productId")}
              hint={
                products.length === 0
                  ? "The catalogue could not be loaded — reload the page to pick a product."
                  : "Type to narrow the list."
              }
            >
              <div className="space-y-2">
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search products by name or slug"
                />
                <Select
                  value={form.productId}
                  invalid={Boolean(fieldError("productId"))}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, productId: e.target.value }))
                  }
                >
                  <option value="">Choose a product…</option>
                  {options.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>
          ) : (
            <Field label="Product" hint="A review cannot be moved to another product.">
              <div className="flex items-center gap-2.5 rounded-lg bg-ink-50 px-3 py-2">
                <ProductCover product={review.product} size={32} />
                <span className="text-sm font-medium text-ink-800">
                  {review.product.name}
                </span>
              </div>
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Published as"
              required
              error={fieldError("authorName")}
              hint="The name shown on the storefront."
            >
              <Input
                value={form.authorName}
                invalid={Boolean(fieldError("authorName"))}
                maxLength={120}
                placeholder="Meera K."
                onChange={(e) =>
                  setForm((f) => ({ ...f, authorName: e.target.value }))
                }
              />
            </Field>

            <Field label="Rating" required error={fieldError("rating")}>
              <div className="flex h-9.5 items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    aria-label={`${star} star${star === 1 ? "" : "s"}`}
                    aria-pressed={form.rating === star}
                    onClick={() => setForm((f) => ({ ...f, rating: star }))}
                    className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    <Star
                      aria-hidden="true"
                      className={cx(
                        "size-6",
                        star <= form.rating
                          ? "fill-gold-500 text-gold-500"
                          : "text-ink-300",
                      )}
                    />
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <Field
            label="Headline"
            error={fieldError("title")}
            hint="Optional. Clear it to remove it."
          >
            <Input
              value={form.title}
              invalid={Boolean(fieldError("title"))}
              maxLength={150}
              placeholder="Lovely fabric, true to the photo"
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </Field>

          <Field
            label="What they said"
            error={fieldError("body")}
            hint="Optional — a rating on its own is a perfectly good review."
          >
            <Textarea
              value={form.body}
              invalid={Boolean(fieldError("body"))}
              maxLength={2000}
              rows={6}
              placeholder="Fell beautifully and the zari work is exactly as pictured."
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            />
          </Field>

          <div className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-ink-800">
                Show on the storefront
              </p>
              <p className="text-xs text-ink-500">
                Off keeps the review here without publishing it.
              </p>
            </div>
            <Toggle
              checked={form.published}
              label="Show on the storefront"
              onChange={(next) => setForm((f) => ({ ...f, published: next }))}
            />
          </div>
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <p className="text-xs text-ink-500">
            {form.rating} star{form.rating === 1 ? "" : "s"} ·{" "}
            {form.published ? "will show on the storefront" : "kept hidden"}
          </p>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" size="lg" busy={saving} onClick={submit}>
              {creating ? "Add review" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
