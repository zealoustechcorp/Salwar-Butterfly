"use client";

import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  MessageSquareQuote,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StatTile } from "@/components/admin/ProductBits";
import { ProductCover } from "@/components/admin/ProductThumb";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  cx,
  EmptyState,
  ErrorNotice,
  Field,
  Input,
  Modal,
  Select,
  SkeletonRows,
  Textarea,
  Toggle,
  useToast,
} from "@/components/admin/ui";
import { listAllProducts } from "@/lib/api/products";
import {
  createReview,
  deleteReview,
  EMPTY_SUMMARY,
  listReviews,
  PUBLISHED_FILTERS,
  RATING_FILTERS,
  RATINGS,
  REVIEW_SORTS,
  setReviewPublished,
  updateReview,
} from "@/lib/api/reviews";
import { number, shortDate } from "@/lib/format";

/**
 * Reviews and ratings (F-11.06).
 *
 * The FRS is explicit that this is an admin-only page, and the reason
 * shows in the shape of the form: there is a field for the name to
 * publish under, because the shop is typing up what a customer said on
 * WhatsApp or on the phone. Nobody signs in and writes one of these.
 *
 * Two gestures, and the softer one is the default. Hiding takes a
 * review off the storefront and keeps it; deleting destroys it and
 * cannot be undone. The toggle sits in every row, the delete is behind
 * a confirmation, and that ordering is deliberate — the recoverable
 * action should be the easy one.
 *
 * The average is over published reviews only, which is what a shopper
 * would see. Folding the hidden ones in would print a figure matching
 * none of the stars beneath it.
 */

const DEFAULT_QUERY = {
  search: "",
  productId: "all",
  rating: "all",
  published: "all",
  sort: "recent",
  page: 1,
};

const PAGE_SIZE = 25;

const BLANK_FORM = {
  productId: "",
  authorName: "",
  rating: 5,
  title: "",
  body: "",
  published: true,
};

export default function ReviewsPage() {
  const toast = useToast();

  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [searchInput, setSearchInput] = useState("");
  const [reload, setReload] = useState(0);

  const [result, setResult] = useState({
    status: "loading",
    query: null,
    rows: [],
    summary: EMPTY_SUMMARY,
    pagination: null,
    error: null,
  });

  // The catalogue, for the product picker and the filter. Fetched once:
  // it is the same list on every open, and re-reading two hundred
  // products each time the modal appears would be work for nothing.
  const [products, setProducts] = useState([]);

  const [editing, setEditing] = useState(null); // review | "new" | null
  const [deleting, setDeleting] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const timer = setTimeout(
      () =>
        setQuery((q) =>
          q.search === searchInput ? q : { ...q, search: searchInput, page: 1 },
        ),
      250,
    );
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    listReviews({ ...query, limit: PAGE_SIZE }, { signal: controller.signal })
      .then((data) => {
        if (active) setResult({ status: "ready", query, ...data, error: null });
      })
      .catch((error) => {
        if (active && error?.name !== "AbortError") {
          setResult((current) => ({ ...current, status: "error", query, error }));
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [query, reload]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    listAllProducts({ signal: controller.signal })
      .then((rows) => {
        if (active) setProducts(rows);
      })
      .catch(() => {
        // A missing catalogue costs the picker, not the page. The list
        // below still renders, and the form says why it cannot save.
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  const togglePublished = async (review) => {
    setBusyId(review.id);

    try {
      const next = await setReviewPublished(review.id, !review.published);

      setResult((current) => ({
        ...current,
        rows: current.rows.map((row) => (row.id === next.id ? next : row)),
      }));

      // The summary counts published and hidden, so a toggle changes it.
      // Refetching is cheaper to reason about than patching two counts
      // and an average by hand.
      refresh();

      toast.success(
        next.published ? "Review published" : "Review hidden",
        next.product.name,
      );
    } catch (error) {
      toast.error("Could not update the review", error.message);
    } finally {
      setBusyId(null);
    }
  };

  const { rows, summary, pagination, error } = result;
  const loading = result.status === "loading" || result.query !== query;

  const filtered =
    query.search !== "" ||
    query.productId !== "all" ||
    query.rating !== "all" ||
    query.published !== "all";

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">
            Reviews &amp; ratings
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            What customers have said, published by the shop. Hide a review to
            take it off the storefront without losing it.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={refresh}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh
          </Button>
          <Button size="sm" variant="primary" onClick={() => setEditing("new")}>
            <Plus className="size-3.5" aria-hidden="true" />
            Add review
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Average rating"
          value={loading ? "—" : summary.average ? summary.average.toFixed(1) : "—"}
          sub={
            summary.published
              ? `across ${number(summary.published)} published`
              : "nothing published yet"
          }
          tone={summary.average >= 4 ? "green" : summary.average ? "amber" : "neutral"}
        />
        <StatTile
          label="Published"
          value={loading ? "—" : number(summary.published)}
          sub="visible on the storefront"
        />
        <StatTile
          label="Hidden"
          value={loading ? "—" : number(summary.hidden)}
          sub="kept, but not shown"
          tone={summary.hidden ? "amber" : "neutral"}
        />

        <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-ink-200/80">
          <p className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">
            Spread
          </p>
          <div className="mt-1.5 space-y-1">
            {RATINGS.map((rating) => {
              const count = summary.distribution?.[rating] ?? 0;
              const share = summary.published
                ? (count / summary.published) * 100
                : 0;

              return (
                <div key={rating} className="flex items-center gap-2">
                  <span className="w-3 text-[11px] text-ink-500 tabular-nums">
                    {rating}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-gold-500"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-[11px] text-ink-500 tabular-nums">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader
          title="All reviews"
          requirement="F-11.06"
          description={
            pagination && !loading
              ? `${number(pagination.total)} ${
                  pagination.total === 1 ? "review" : "reviews"
                }${filtered ? " matching these filters" : ""}`
              : "Search by author, product, or what they wrote."
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-400"
                />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Author, product or wording"
                  aria-label="Search reviews"
                  className="w-56 pl-8"
                />
              </div>

              <Select
                value={query.productId}
                aria-label="Filter by product"
                className="w-52"
                onChange={(e) =>
                  setQuery((q) => ({ ...q, productId: e.target.value, page: 1 }))
                }
              >
                <option value="all">Every product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </Select>

              <Select
                value={query.rating}
                aria-label="Filter by rating"
                className="w-36"
                onChange={(e) =>
                  setQuery((q) => ({ ...q, rating: e.target.value, page: 1 }))
                }
              >
                {RATING_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>

              <Select
                value={query.published}
                aria-label="Filter by visibility"
                className="w-44"
                onChange={(e) =>
                  setQuery((q) => ({ ...q, published: e.target.value, page: 1 }))
                }
              >
                {PUBLISHED_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>

              <Select
                value={query.sort}
                aria-label="Sort reviews"
                className="w-40"
                onChange={(e) =>
                  setQuery((q) => ({ ...q, sort: e.target.value, page: 1 }))
                }
              >
                {REVIEW_SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          }
        />

        {error ? (
          <div className="p-4">
            <ErrorNotice error={error} onRetry={refresh} />
          </div>
        ) : loading ? (
          <SkeletonRows rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={
              filtered ? (
                <SearchX className="size-6" aria-hidden="true" />
              ) : (
                <MessageSquareQuote className="size-6" aria-hidden="true" />
              )
            }
            title={filtered ? "No reviews match those filters" : "No reviews yet"}
            description={
              filtered
                ? "Try clearing the rating or visibility filter."
                : "Add what customers have told you on WhatsApp or on the phone."
            }
            action={
              filtered ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearchInput("");
                    setQuery(DEFAULT_QUERY);
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setEditing("new")}>
                  <Plus className="size-3.5" aria-hidden="true" />
                  Add the first review
                </Button>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((review) => (
              <ReviewRow
                key={review.id}
                review={review}
                busy={busyId === review.id}
                onEdit={() => setEditing(review)}
                onDelete={() => setDeleting(review)}
                onTogglePublished={() => togglePublished(review)}
              />
            ))}
          </ul>
        )}

        {pagination && pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-ink-200/80 px-3 py-2.5">
            <p className="text-xs text-ink-500">
              Page {pagination.page} of {pagination.totalPages} ·{" "}
              {number(pagination.total)} reviews
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                disabled={!pagination.hasPreviousPage}
                onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}
              >
                <ChevronLeft className="size-3.5" aria-hidden="true" />
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!pagination.hasNextPage}
                onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}
              >
                Next
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <ReviewDialog
        open={editing !== null}
        review={editing === "new" ? null : editing}
        products={products}
        onClose={() => setEditing(null)}
        onSaved={(saved, created) => {
          setEditing(null);
          refresh();
          toast.success(
            created ? "Review added" : "Review updated",
            saved.product.name,
          );
        }}
      />

      <DeleteReviewDialog
        review={deleting}
        onClose={() => setDeleting(null)}
        onDone={(subject, action) => {
          setDeleting(null);
          refresh();

          if (action === "deleted") {
            toast.success("Review deleted", `by ${subject.authorName}`);
          } else {
            toast.info("Review hidden instead", "Nothing was deleted.");
          }
        }}
      />
    </div>
  );
}

// ============================================================
// ROW
// ============================================================

function ReviewRow({ review, busy, onEdit, onDelete, onTogglePublished }) {
  return (
    <li
      className={cx(
        "flex flex-wrap items-start gap-3 px-4 py-3 transition-colors hover:bg-ink-50/60",
        !review.published && "bg-ink-50/40",
      )}
    >
      <ProductCover product={review.product} size={40} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Stars rating={review.rating} />

          <span className="text-sm font-medium text-ink-900">
            {review.authorName}
          </span>

          {review.customer ? (
            <Badge tone="brand" title={review.customer.email}>
              account
            </Badge>
          ) : null}

          {!review.published ? <Badge tone="slate">Hidden</Badge> : null}
        </div>

        {review.title ? (
          <p className="mt-1 text-sm font-medium text-ink-800">{review.title}</p>
        ) : null}

        {review.body ? (
          <p className="mt-0.5 text-sm text-ink-600">{review.body}</p>
        ) : (
          <p className="mt-0.5 text-sm text-ink-400 italic">
            A rating with no words.
          </p>
        )}

        <p className="mt-1 text-xs text-ink-500">
          <Link
            href={`/admin/products/${review.productId}`}
            className="hover:text-brand-700 hover:underline"
          >
            {review.product.name}
          </Link>
          {" · "}
          {shortDate(review.createdAt)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {/* Hiding first, deleting last, and a gap between them: the
            recoverable action should be the one within easy reach. */}
        <Button
          size="sm"
          variant="ghost"
          busy={busy}
          onClick={onTogglePublished}
          title={
            review.published
              ? "Take this off the storefront"
              : "Show this on the storefront"
          }
        >
          {review.published ? (
            <EyeOff className="size-3.5" aria-hidden="true" />
          ) : (
            <Eye className="size-3.5" aria-hidden="true" />
          )}
          {review.published ? "Hide" : "Publish"}
        </Button>

        <Button size="sm" variant="secondary" onClick={onEdit}>
          <Pencil className="size-3.5" aria-hidden="true" />
          Edit
        </Button>

        <Button size="sm" variant="danger" onClick={onDelete} aria-label="Delete review">
          <Trash2 className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

function Stars({ rating }) {
  return (
    <span
      className="inline-flex items-center gap-px"
      role="img"
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          aria-hidden="true"
          className={cx(
            "size-3.5",
            star <= rating ? "fill-gold-500 text-gold-500" : "text-ink-300",
          )}
        />
      ))}
    </span>
  );
}

// ============================================================
// EDITOR
// ============================================================

/**
 * Add and edit in one dialog.
 *
 * The product cannot be changed once a review exists. Moving a review
 * between products would silently restate two averages at once, and
 * there is no case for it that deleting and re-adding does not cover
 * more honestly.
 */
function ReviewDialog({ open, review, products, onClose, onSaved }) {
  const [form, setForm] = useState(BLANK_FORM);
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const creating = !review;

  /**
   * Loads the form when the dialog opens on a different review.
   *
   * Adjusted during render rather than in an effect. The effect version
   * paints one frame of the *previous* review's answers before the
   * reset lands, which on a dialog is a visible flash of somebody
   * else's words. React's documented pattern for deriving state from a
   * changed prop, and the reason there is no `useEffect` here.
   */
  const subject = open ? (review?.id ?? "new") : null;
  const [loaded, setLoaded] = useState(null);

  if (subject === null) {
    // Forgotten on close, so reopening the same review starts from what
    // is saved rather than from the edits that were just cancelled.
    if (loaded !== null) setLoaded(null);
  } else if (loaded !== subject) {
    setLoaded(subject);
    setError(null);
    setProductSearch("");

    setForm(
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
  }

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

  const save = async () => {
    setSaving(true);
    setError(null);

    try {
      const saved = creating
        ? await createReview(form)
        : await updateReview(review.id, {
            authorName: form.authorName,
            rating: form.rating,

            // Sent even when empty: "" is how the API is told to clear
            // a title the admin has just deleted out of the box.
            title: form.title,
            body: form.body,
            published: form.published,
          });

      onSaved(saved, creating);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title={creating ? "Add a review" : "Edit review"}
      requirement="F-11.06"
      description={
        creating
          ? "What a customer told the shop, published in their name."
          : `Published under ${review?.authorName}.`
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} busy={saving}>
            {creating ? "Add review" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
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
            rows={4}
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
    </Modal>
  );
}

// ============================================================
// DELETE
// ============================================================

/**
 * The confirmation.
 *
 * It offers hiding as well, because nine times in ten that is what was
 * actually meant — a review the shop no longer wants shown, not one it
 * wants gone. Putting the softer option inside the dialog is cheaper
 * than an undo that would have to resurrect a deleted row.
 */
function DeleteReviewDialog({ review, onClose, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);

    try {
      await deleteReview(review.id);
      onDone(review, "deleted");
    } catch (error) {
      toast.error("Could not delete the review", error.message);
    } finally {
      setBusy(false);
    }
  };

  const hide = async () => {
    setBusy(true);

    try {
      await setReviewPublished(review.id, false);
      onDone(review, "hidden");
    } catch (error) {
      toast.error("Could not hide the review", error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(review)}
      onClose={busy ? () => {} : onClose}
      size="sm"
      title="Delete this review?"
      description="This cannot be undone."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {review?.published ? (
            <Button variant="secondary" onClick={hide} disabled={busy}>
              Hide it instead
            </Button>
          ) : null}
          <Button variant="danger" onClick={remove} busy={busy}>
            Delete
          </Button>
        </>
      }
    >
      {review ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Stars rating={review.rating} />
            <span className="text-sm font-medium text-ink-900">
              {review.authorName}
            </span>
          </div>

          {review.title ? (
            <p className="text-sm font-medium text-ink-800">{review.title}</p>
          ) : null}

          {review.body ? (
            <p className="text-sm text-ink-600">{review.body}</p>
          ) : null}

          <p className="text-xs text-ink-500">
            On {review.product.name} · {shortDate(review.createdAt)}
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
