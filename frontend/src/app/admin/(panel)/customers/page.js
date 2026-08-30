"use client";

import { ChevronLeft, ChevronRight, Search, SearchX, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Button,
  Card,
  CardHeader,
  cx,
  EmptyState,
  ErrorNotice,
  Input,
  Select,
  SkeletonRows,
} from "@/components/admin/ui";
import { CUSTOMER_SORTS, listCustomers } from "@/lib/api/customers";
import { number, shortDate } from "@/lib/format";

/**
 * Customers (F-05.04) — who has an account, and how to reach them.
 *
 * Read-only by design. There is no "add customer" button because there
 * is no such act: an account comes into being when a person registers
 * themselves, and a row an admin typed in would have no password and
 * so no way to be signed into. Everything that can be changed lives on
 * the customer's own screen, one click away.
 *
 * The search deliberately takes one box for name, email and phone. An
 * admin looking someone up has whichever of the three the customer just
 * read out over the phone, and making them pick a field first is a
 * question the screen can answer itself.
 *
 * Paged from the server rather than fetched whole and filtered here,
 * unlike the products screen. Products are a catalogue of a few hundred
 * that the shop controls; customers are a list that only grows, and it
 * is personal data — pulling all of it into the browser to show
 * twenty-five rows is the wrong default in both respects.
 */

const DEFAULT_QUERY = {
  search: "",
  sort: "recent",
  page: 1,
};

const PAGE_SIZE = 25;

export default function CustomersPage() {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [searchInput, setSearchInput] = useState("");
  const [reload, setReload] = useState(0);

  // Request and outcome in one object: comparing the stored query with
  // the current one says a refetch is in flight without a second flag.
  const [result, setResult] = useState({
    status: "loading",
    query: null,
    rows: [],
    pagination: null,
    error: null,
  });

  // Debounced, so a search does not fire a request per keystroke. A new
  // term also rewinds to page 1 — the old offset means nothing against
  // a different result set.
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

    listCustomers({ ...query, limit: PAGE_SIZE }, { signal: controller.signal })
      .then((data) => {
        if (!active) return;
        setResult({ status: "ready", query, ...data, error: null });
      })
      .catch((error) => {
        if (active && error?.name !== "AbortError") {
          setResult((current) => ({
            ...current,
            status: "error",
            query,
            error,
          }));
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [query, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  const { rows, pagination, error } = result;
  const loading = result.status === "loading" || result.query !== query;

  const searched = query.search !== "";

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">
            Customers
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Everyone with an account on the storefront. Accounts are created by
            customers when they register — open one to correct its details or
            close it.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader
          title="All customers"
          requirement="F-05.04"
          description={
            pagination && !loading
              ? `${number(pagination.total)} ${
                  pagination.total === 1 ? "account" : "accounts"
                }${searched ? " matching this search" : ""}`
              : "Search by name, email or phone."
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
                  placeholder="Name, email or phone"
                  aria-label="Search customers"
                  className="w-56 pl-8"
                />
              </div>

              <Select
                value={query.sort}
                aria-label="Sort customers"
                className="w-44"
                onChange={(e) =>
                  setQuery((q) => ({ ...q, sort: e.target.value, page: 1 }))
                }
              >
                {CUSTOMER_SORTS.map((sort) => (
                  <option key={sort.value} value={sort.value}>
                    {sort.label}
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
          <SkeletonRows rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={
              searched ? (
                <SearchX className="size-6" aria-hidden="true" />
              ) : (
                <Users className="size-6" aria-hidden="true" />
              )
            }
            title={searched ? "Nobody matches that search" : "No customers yet"}
            description={
              searched
                ? "Try part of a name, an email address, or the last few digits of a phone number."
                : "Accounts appear here as people register on the storefront."
            }
            action={
              searched ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearchInput("");
                    setQuery(DEFAULT_QUERY);
                  }}
                >
                  Clear search
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50/60 text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Email</th>
                  <th className="px-3 py-2.5">Phone</th>
                  <th className="px-3 py-2.5">Joined</th>
                  <th className="w-20 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((customer) => (
                  <CustomerRow key={customer.id} customer={customer} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-ink-200/80 px-3 py-2.5">
            <p className="text-xs text-ink-500">
              Page {pagination.page} of {pagination.totalPages} ·{" "}
              {number(pagination.total)} customers
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
    </div>
  );
}

/** "Radhika Sivasenthil" → "RS"; falls back to the email's first letter. */
function initialsOf(name, email) {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return String(email ?? "?")
      .charAt(0)
      .toUpperCase();
  }

  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";

  return (first + last).toUpperCase();
}

function CustomerRow({ customer }) {
  const href = `/admin/customers/${customer.id}`;

  return (
    <tr className="align-middle transition-colors hover:bg-ink-50/70">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gold-100 text-xs font-semibold text-gold-800">
            {initialsOf(customer.name, customer.email)}
          </span>
          <Link
            href={href}
            className="font-medium text-ink-900 hover:text-brand-700 hover:underline"
          >
            {customer.name || "—"}
          </Link>
        </div>
      </td>

      <td className="px-3 py-2.5">
        <a
          href={`mailto:${customer.email}`}
          className="break-all text-ink-600 hover:text-brand-700 hover:underline"
        >
          {customer.email || "—"}
        </a>
      </td>

      <td className={cx("px-3 py-2.5 tabular-nums text-ink-600")}>
        {customer.phone ? (
          <a
            href={`tel:${customer.phone}`}
            className="hover:text-brand-700 hover:underline"
          >
            {customer.phone}
          </a>
        ) : (
          "—"
        )}
      </td>

      <td className="px-3 py-2.5 whitespace-nowrap text-ink-500">
        {shortDate(customer.createdAt)}
      </td>

      <td className="px-3 py-2.5 text-right">
        <Link
          href={href}
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          View
        </Link>
      </td>
    </tr>
  );
}
