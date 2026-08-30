"use client";

import { ArrowLeft, Mail, Phone, UserX } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  Field,
  Input,
  Modal,
  SkeletonRows,
  useToast,
} from "@/components/admin/ui";
import { deleteCustomer, getCustomer, updateCustomer } from "@/lib/api/customers";
import { shortDate } from "@/lib/format";

/**
 * One customer (F-05.04), and the two things an admin may do to them.
 *
 * Editing is F-05.06 from the other side of the counter: a customer
 * changes their own details from their account, and the shop changes
 * them when someone rings up to say the phone number on their order is
 * wrong. Email and phone are unique across live accounts, so a clash
 * comes back from the API named — and lands under the offending input
 * rather than in a toast that does not say which field to fix.
 *
 * Closing an account is a soft delete on the API side. The row stays
 * and is stamped, which matters once orders exist: an order has to keep
 * pointing at the person who placed it. What the customer loses is the
 * ability to sign in, and what the shop loses is the row from this
 * list. Their email and phone are freed for a fresh sign-up, because
 * the uniqueness indexes only cover accounts that are still live.
 *
 * There is no password control here on purpose. An admin who can set a
 * customer's password can sign in as them; the customer changes their
 * own with their current one, which is the only version of that feature
 * this screen should offer.
 */

const EDITABLE = ["name", "email", "phone"];

export default function CustomerDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();

  const [state, setState] = useState({
    status: "loading",
    customer: null,
    error: null,
  });

  const [form, setForm] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    getCustomer(id, { signal: controller.signal })
      .then((customer) => {
        if (!active) return;
        setState({ status: "ready", customer, error: null });
        // The form is seeded once per load. Re-seeding on every render
        // would fight the admin's typing.
        setForm({
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
        });
        setFieldErrors({});
      })
      .catch((error) => {
        if (active && error?.name !== "AbortError") {
          setState({ status: "error", customer: null, error });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [id, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  const { status, customer, error } = state;

  // Only what actually changed is sent: the API takes a partial update,
  // and re-sending an unchanged email would still make it check that
  // address for a clash against every other account.
  const changed = form
    ? EDITABLE.filter((key) => form[key].trim() !== (customer?.[key] ?? ""))
    : [];

  async function save() {
    if (changed.length === 0) return;

    setSaving(true);
    setFieldErrors({});

    try {
      const updated = await updateCustomer(
        id,
        Object.fromEntries(changed.map((key) => [key, form[key].trim()])),
      );

      setState((current) => ({ ...current, customer: updated }));
      setForm({
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
      });

      toast.success("Customer details updated.");
    } catch (err) {
      // A 409 names the field that clashed; a 400 names the ones that
      // failed validation. Either way the message belongs on the input.
      if (err?.fields && Object.keys(err.fields).length > 0) {
        setFieldErrors(err.fields);
      } else {
        toast.error(err?.message || "Could not save those details.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") {
    return (
      <Card>
        <SkeletonRows rows={5} />
      </Card>
    );
  }

  if (status === "error") {
    // A 404 is a different thing from an outage: this id is not an
    // account, and no amount of retrying will make it one.
    if (error?.status === 404) {
      return (
        <EmptyState
          icon={<UserX className="size-6" aria-hidden="true" />}
          title="No such customer"
          description="This account does not exist, or it has been closed."
          action={
            <Button variant="secondary" onClick={() => router.push("/admin/customers")}>
              Back to customers
            </Button>
          }
        />
      );
    }

    return <ErrorNotice error={error} onRetry={refresh} />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link
          href="/admin/customers"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          All customers
        </Link>

        <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink-900">
          {customer.name}
        </h1>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
          <a
            href={`mailto:${customer.email}`}
            className="inline-flex items-center gap-1.5 hover:text-brand-700 hover:underline"
          >
            <Mail className="size-3.5" aria-hidden="true" />
            {customer.email}
          </a>
          <a
            href={`tel:${customer.phone}`}
            className="inline-flex items-center gap-1.5 tabular-nums hover:text-brand-700 hover:underline"
          >
            <Phone className="size-3.5" aria-hidden="true" />
            {customer.phone}
          </a>
          <span>Joined {shortDate(customer.createdAt)}</span>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Details"
          requirement="F-05.06"
          description="Correct a name, email or phone number. The customer can change these themselves from their account."
        />

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Name" error={fieldErrors.name} className="sm:col-span-2">
            <Input
              value={form.name}
              invalid={Boolean(fieldErrors.name)}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
            />
          </Field>

          <Field label="Email" error={fieldErrors.email}>
            <Input
              type="email"
              value={form.email}
              invalid={Boolean(fieldErrors.email)}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
            />
          </Field>

          <Field
            label="Phone"
            error={fieldErrors.phone}
            hint={fieldErrors.phone ? undefined : "10 to 15 digits, optionally with a country code."}
          >
            <Input
              value={form.phone}
              invalid={Boolean(fieldErrors.phone)}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: e.target.value }))
              }
            />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-ink-200/80 px-5 py-3">
          <p className="text-xs text-ink-500">
            {changed.length === 0
              ? `Last updated ${shortDate(customer.updatedAt)}`
              : `${changed.length} unsaved ${changed.length === 1 ? "change" : "changes"}`}
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              disabled={changed.length === 0 || saving}
              onClick={() =>
                setForm({
                  name: customer.name,
                  email: customer.email,
                  phone: customer.phone,
                })
              }
            >
              Discard
            </Button>
            <Button
              variant="primary"
              busy={saving}
              disabled={changed.length === 0}
              onClick={save}
            >
              Save changes
            </Button>
          </div>
        </div>
      </Card>

      <Card className="ring-red-200">
        <CardHeader
          title="Close this account"
          description="The customer can no longer sign in, and this record leaves the customer list. Their order history is kept."
          actions={
            <Button variant="danger" onClick={() => setCloseOpen(true)}>
              Close account
            </Button>
          }
        />
      </Card>

      <CloseAccountDialog
        open={closeOpen}
        customer={customer}
        onClose={() => setCloseOpen(false)}
        onDone={() => router.push("/admin/customers")}
      />
    </div>
  );
}

function CloseAccountDialog({ open, customer, onClose, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await deleteCustomer(customer.id);
      toast.success(`${customer.name}'s account was closed.`);
      onDone();
    } catch (err) {
      toast.error(err?.message || "Could not close that account.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Close this account?"
      requirement="F-05.05"
      description={`${customer.name} will no longer be able to sign in.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" busy={busy} onClick={run}>
            Close account
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-ink-600">
        <p>
          The record is kept rather than erased, so anything that already
          points at this customer — their orders, once orders exist — still
          has someone to point at.
        </p>
        <p>
          <span className="font-medium text-ink-800">{customer.email}</span> and{" "}
          <span className="font-medium text-ink-800">{customer.phone}</span>{" "}
          become available again, so this person can register a fresh account
          with the same details later.
        </p>
      </div>
    </Modal>
  );
}
