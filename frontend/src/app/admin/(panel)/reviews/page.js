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
import { useCallback, useEffect, useState } from "react";

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
  Input,
  LinkButton,
  Modal,
  Select,
  SkeletonRows,
  useToast,
} from "@/components/admin/ui";
import { listAllProducts } from "@/lib/api/products";
import {
  deleteReview,
  EMPTY_SUMMARY,
  listReviews,
  PUBLISHED_FILTERS,
  RATING_FILTERS,
  RATINGS,
  REVIEW_SORTS,
  setReviewPublished,
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
 * Adding and editing are pages — /reviews/new and /reviews/[id]/edit —
 * rather than the dialog they were. This is the shop typing up a
 * paragraph from a WhatsApp conversation open in another window, and a
 * dialog cannot be reloaded, linked to or left alone while something
 * else is checked. Only the delete confirmation is still a dialog,
 * which is what a dialog is for: one question, one answer, nothing to
 * keep.
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

  // The catalogue, for the product filter above the list. The editor
  // reads its own copy on /reviews/new, where the picker lives.
  const [products, setProducts] = useState([]);

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
          <LinkButton size="sm" variant="primary" href="/admin/reviews/new">
            <Plus className="size-3.5" aria-hidden="true" />
            Add review
          </LinkButton>
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
          description={
            pagination && !loading
              ? `${number(pagination.total)} ${
                  pagination.total === 1 ? "review" : "reviews"
                }${filtered ? " matching these filters" : ""}`
              : "Search by author, product, or what they wrote."
          }
          actions={
            <div className="flex w-full flex-wrap items-center gap-2">
              {/* The search takes whatever the four filters leave, down to a
                  floor of 12rem; past that the row wraps rather than
                  spilling out of the card. */}
              <div className="relative min-w-48 flex-1 sm:max-w-64">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-400"
                />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Author, product or wording"
                  aria-label="Search reviews"
                  className="pl-8"
                />
              </div>

              <Select
                value={query.productId}
                aria-label="Filter by product"
                className="w-44"
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
                className="w-32"
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
                className="w-40"
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
                className="w-36"
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
                <LinkButton variant="primary" href="/admin/reviews/new">
                  <Plus className="size-3.5" aria-hidden="true" />
                  Add the first review
                </LinkButton>
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

function ReviewRow({ review, busy, onDelete, onTogglePublished }) {
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

        <LinkButton
          size="sm"
          variant="secondary"
          href={`/admin/reviews/${review.id}/edit`}
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          Edit
        </LinkButton>

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
