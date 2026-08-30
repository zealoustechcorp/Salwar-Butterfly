"use client";

import {
  ArrowLeft,
  Mail,
  MapPin,
  PackageX,
  Phone,
  User,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ProductCover } from "@/components/admin/ProductThumb";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  Field,
  Input,
  Modal,
  SkeletonRows,
  Textarea,
  useToast,
} from "@/components/admin/ui";
import {
  addressLines,
  advanceOrder,
  cancelOrder,
  confirmPayment,
  getOrder,
  movesFor,
  paymentMeta,
  statusMeta,
} from "@/lib/api/orders";
import { attemptMeta, listOrderPayments, methodLabel } from "@/lib/api/payments";
import { dateTime, money, number } from "@/lib/format";

/**
 * One order (F-09.04), and the three things the shop may do to it
 * (F-09.05).
 *
 * The panel on the right is the whole reason this screen exists, so it
 * comes first in the reading order on a narrow screen and sits at the
 * top of the sidebar on a wide one. It offers only the moves the API
 * would accept from where this order actually is — the transition table
 * lives in the API's policy module and is mirrored in lib/api/orders.js,
 * so a button that cannot work is never drawn.
 *
 * Two of the three moves are not status writes and are not treated as
 * one:
 *
 *   Confirming payment records the money with the transition. It asks
 *   for a reference because that is the only thread back from an order
 *   to the transfer that paid for it, and a week later nobody remembers.
 *
 *   Cancelling returns the pieces to the shelf in the same transaction.
 *   It requires a reason, because the customer will ring up about it and
 *   "cancelled, no reason recorded" is not an answer.
 *
 * A 409 means the order moved while this screen was open — two people
 * packing from the same list is the ordinary case, not the exotic one —
 * so the message is shown and the order is refetched rather than left
 * showing buttons that no longer apply.
 *
 * Everything above the items is a snapshot taken at checkout: the name,
 * the phone number and the address are what the parcel was addressed to,
 * not what the customer's account says today. That is deliberate on the
 * API's side and must not be "corrected" here.
 */

/** Rendered in this order, and only where the order actually has one. */
const TIMELINE_STEPS = [
  { key: "placedAt", label: "Placed" },
  { key: "paidAt", label: "Payment confirmed" },
  { key: "packedAt", label: "Packed" },
  { key: "shippedAt", label: "Handed to the courier" },
  { key: "deliveredAt", label: "Delivered" },
  { key: "cancelledAt", label: "Cancelled" },
];

export default function OrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();

  const [state, setState] = useState({
    status: "loading",
    order: null,
    error: null,
  });

  const [reload, setReload] = useState(0);
  const [busyMove, setBusyMove] = useState(null);

  // "confirm" | "cancel" | null, and a counter beside it. The counter is
  // the dialogs' remount key: a reference typed and abandoned must not be
  // offered again against a different transfer, and remounting is how a
  // form is reset without an effect that writes state on open.
  const [dialog, setDialog] = useState(null);
  const [dialogSeq, setDialogSeq] = useState(0);

  const openDialog = (name) => {
    setDialogSeq((n) => n + 1);
    setDialog(name);
  };

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    getOrder(id, { signal: controller.signal })
      .then((order) => {
        if (active) setState({ status: "ready", order, error: null });
      })
      .catch((error) => {
        if (active && error?.name !== "AbortError") {
          setState({ status: "error", order: null, error });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [id, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  const { status, order, error } = state;

  /** A write came back: show the order the API returned, not a guess. */
  function applied(updated, message) {
    setState((current) => ({ ...current, order: updated }));
    toast.success(message);
  }

  async function advance(move) {
    setBusyMove(move.status);

    try {
      const updated = await advanceOrder(order.id, move.status);
      applied(
        updated,
        `${updated.orderNumber} is now ${statusMeta(updated.status).label.toLowerCase()}.`,
      );
    } catch (err) {
      toast.error(err?.message || "Could not update that order.");

      // The order moved underneath this screen. Whatever it is now, the
      // buttons showing are for a state it has left.
      if (err?.status === 409) refresh();
    } finally {
      setBusyMove(null);
    }
  }

  if (status === "loading") {
    return (
      <Card>
        <SkeletonRows rows={6} />
      </Card>
    );
  }

  if (status === "error") {
    // A 404 is a different thing from an outage: this id is not an
    // order, and no amount of retrying will make it one.
    if (error?.status === 404) {
      return (
        <EmptyState
          icon={<PackageX className="size-6" aria-hidden="true" />}
          title="No such order"
          description="This order does not exist. It may have been opened from a stale link."
          action={
            <Button variant="secondary" onClick={() => router.push("/admin/orders")}>
              Back to orders
            </Button>
          }
        />
      );
    }

    return <ErrorNotice error={error} onRetry={refresh} />;
  }

  const orderStatus = statusMeta(order.status);
  const payment = paymentMeta(order.paymentStatus);
  const moves = movesFor(order.status);
  const address = addressLines(order.shippingAddress);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          All orders
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-mono text-xl font-semibold tracking-tight text-ink-900">
            {order.orderNumber}
          </h1>
          <Badge tone={orderStatus.tone}>{orderStatus.label}</Badge>
          <Badge tone={payment.tone}>{payment.label}</Badge>
        </div>

        <p className="mt-1.5 text-sm text-ink-500">
          Placed {dateTime(order.timeline.placedAt)} ·{" "}
          {number(order.unitCount)} {order.unitCount === 1 ? "piece" : "pieces"}{" "}
          across {number(order.itemCount)}{" "}
          {order.itemCount === 1 ? "style" : "styles"} ·{" "}
          {money(order.total, { precise: true })}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="What was ordered"
              description="Names, sizes and prices as they were at checkout — not as the catalogue reads today."
            />

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50/60 text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                    <th className="px-4 py-2.5">Piece</th>
                    <th className="px-3 py-2.5">Size</th>
                    <th className="px-3 py-2.5 text-right">Unit</th>
                    <th className="px-3 py-2.5 text-right">Qty</th>
                    <th className="px-4 py-2.5 text-right">Line</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {order.items.map((item) => (
                    <tr key={item.id} className="align-middle">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <ProductCover product={item.product} size={40} />
                          {/* Null once the product row is deleted — the
                              line still reads, it just links nowhere. */}
                          {item.productId ? (
                            <Link
                              href={`/admin/products/${item.productId}`}
                              className="font-medium text-ink-900 hover:text-brand-700 hover:underline"
                            >
                              {item.productName}
                            </Link>
                          ) : (
                            <span className="font-medium text-ink-900">
                              {item.productName}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-ink-600">
                        {item.size || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-ink-600 tabular-nums">
                        {money(item.unitPrice, { precise: true })}
                      </td>
                      <td className="px-3 py-2.5 text-right text-ink-600 tabular-nums">
                        {number(item.quantity)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-ink-900 tabular-nums">
                        {money(item.lineTotal, { precise: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <dl className="space-y-1.5 border-t border-ink-200/80 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-500">Subtotal</dt>
                <dd className="text-ink-700 tabular-nums">
                  {money(order.subtotal, { precise: true })}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-500">Delivery</dt>
                <dd className="text-ink-700 tabular-nums">
                  {order.shippingFee
                    ? money(order.shippingFee, { precise: true })
                    : "Free"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-ink-200/80 pt-1.5">
                <dt className="font-semibold text-ink-900">Total</dt>
                <dd className="font-semibold text-ink-900 tabular-nums">
                  {money(order.total, { precise: true })}
                </dd>
              </div>
            </dl>
          </Card>

          {order.customerNote ? (
            <Card>
              <CardHeader
                title="Note from the customer"
                description="Left at checkout."
              />
              <p className="px-5 py-4 text-sm whitespace-pre-line text-ink-700">
                {order.customerNote}
              </p>
            </Card>
          ) : null}

          {order.cancellationReason ? (
            <Card className="ring-red-200">
              <CardHeader
                title="Why this order was cancelled"
                description="Recorded when the order was cancelled. Its pieces went back on the shelf."
              />
              <p className="px-5 py-4 text-sm whitespace-pre-line text-ink-700">
                {order.cancellationReason}
              </p>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Move this order along" requirement="F-09.05" />

            <div className="space-y-3 px-5 py-4">
              <p className="text-xs text-ink-500">{orderStatus.blurb}</p>

              {moves.length === 0 ? null : (
                <div className="flex flex-col gap-2">
                  {moves.map((move) =>
                    move.kind === "cancel" ? (
                      <Button
                        key={move.status}
                        variant="danger"
                        disabled={Boolean(busyMove)}
                        onClick={() => openDialog("cancel")}
                      >
                        {move.label}
                      </Button>
                    ) : (
                      <Button
                        key={move.status}
                        variant="primary"
                        busy={busyMove === move.status}
                        disabled={Boolean(busyMove)}
                        onClick={() =>
                          move.kind === "confirm"
                            ? openDialog("confirm")
                            : advance(move)
                        }
                      >
                        {move.label}
                      </Button>
                    ),
                  )}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Who it goes to" />

            <div className="space-y-2.5 px-5 py-4 text-sm">
              <p className="flex items-center gap-2 font-medium text-ink-900">
                <User className="size-3.5 shrink-0 text-ink-400" aria-hidden="true" />
                {order.contact.name || "—"}
              </p>

              <a
                href={`mailto:${order.contact.email}`}
                className="flex items-center gap-2 break-all text-ink-600 hover:text-brand-700 hover:underline"
              >
                <Mail className="size-3.5 shrink-0 text-ink-400" aria-hidden="true" />
                {order.contact.email}
              </a>

              <a
                href={`tel:${order.contact.phone}`}
                className="flex items-center gap-2 text-ink-600 tabular-nums hover:text-brand-700 hover:underline"
              >
                <Phone className="size-3.5 shrink-0 text-ink-400" aria-hidden="true" />
                {order.contact.phone}
              </a>

              <div className="flex items-start gap-2 border-t border-ink-200/80 pt-2.5 text-ink-600">
                <MapPin
                  className="mt-0.5 size-3.5 shrink-0 text-ink-400"
                  aria-hidden="true"
                />
                <address className="not-italic">
                  {address.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </address>
              </div>

              <p className="border-t border-ink-200/80 pt-2.5 text-xs text-ink-500">
                {order.customerId ? (
                  <>
                    Placed from an account —{" "}
                    <Link
                      href={`/admin/customers/${order.customerId}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      open the customer
                    </Link>
                    .
                  </>
                ) : (
                  "Checked out as a guest, with no account attached."
                )}
              </p>
            </div>
          </Card>

          <PaymentAttempts orderId={order.id} reload={reload} />

          <Card>
            <CardHeader title="History" />

            <ol className="space-y-2.5 px-5 py-4 text-sm">
              {TIMELINE_STEPS.filter((step) => order.timeline[step.key]).map(
                (step) => (
                  <li
                    key={step.key}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="text-ink-700">{step.label}</span>
                    <span className="shrink-0 text-xs text-ink-500 tabular-nums">
                      {dateTime(order.timeline[step.key])}
                    </span>
                  </li>
                ),
              )}
            </ol>
          </Card>
        </div>
      </div>

      <ConfirmPaymentDialog
        key={`confirm-${dialogSeq}`}
        open={dialog === "confirm"}
        order={order}
        onClose={() => setDialog(null)}
        onDone={(updated) => {
          setDialog(null);
          applied(updated, `${updated.orderNumber} confirmed — payment recorded.`);
        }}
        onConflict={refresh}
      />

      <CancelOrderDialog
        key={`cancel-${dialogSeq}`}
        open={dialog === "cancel"}
        order={order}
        onClose={() => setDialog(null)}
        onDone={(updated) => {
          setDialog(null);
          applied(updated, `${updated.orderNumber} cancelled — its stock is back on the shelf.`);
        }}
        onConflict={refresh}
      />
    </div>
  );
}

/**
 * Every gateway attempt on this order (F-10).
 *
 * Renders nothing when there are none, which is the common case and not an
 * error: an order paid by bank transfer and confirmed by hand never opened a
 * payment sheet, and neither did anything placed before the gateway existed.
 * An empty card headed "Payments" would read as something having gone wrong.
 *
 * Its own request rather than a field on the order. It is a different question
 * with a different audience — the rest of this screen is about a parcel — and
 * the order list would be carrying it on every row for nothing.
 *
 * A failure here is shown but never allowed to take the screen down with it.
 * This is supplementary; the order above it is what the shop came for, and it
 * is already on screen.
 */
function PaymentAttempts({ orderId, reload }) {
  const [state, setState] = useState({ status: "loading", rows: [], error: null });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    listOrderPayments(orderId, { signal: controller.signal })
      .then((rows) => {
        if (active) setState({ status: "ready", rows, error: null });
      })
      .catch((error) => {
        if (active && error?.name !== "AbortError") {
          setState({ status: "error", rows: [], error });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [orderId, reload]);

  if (state.status === "loading") return null;

  if (state.status === "error") {
    return (
      <Card>
        <CardHeader title="Payments" requirement="F-10" />
        <p className="px-5 py-4 text-xs text-ink-500">
          Could not load the payment history. The order above is unaffected.
        </p>
      </Card>
    );
  }

  if (state.rows.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Payments"
        description="Every attempt through the gateway, newest first."
        requirement="F-10"
      />

      <ol className="divide-y divide-ink-100">
        {state.rows.map((attempt) => {
          const meta = attemptMeta(attempt.status);
          const method = methodLabel(attempt.method);

          return (
            <li key={attempt.id} className="space-y-1.5 px-5 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-ink-900 tabular-nums">
                  {money(attempt.amount, { precise: true })}
                </span>
                <span
                  className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${meta.tone}`}
                >
                  {meta.label}
                </span>
              </div>

              <p className="text-xs text-ink-500">
                {[
                  method,
                  attempt.isManual ? "Recorded by the shop" : attempt.provider,
                  dateTime(attempt.paidAt ?? attempt.createdAt),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              {/* The gateway's own words. This is what a support call is
                  actually about — "declined by the issuing bank" is an
                  answer, "failed" is not. */}
              {attempt.error ? (
                <p className="text-xs text-red-700">{attempt.error.description}</p>
              ) : null}

              {/* The id to quote to Razorpay, and the only thread from this
                  row to their dashboard. Wrapped rather than truncated: a
                  reference that cannot be read in full cannot be quoted. */}
              {attempt.providerPaymentId ? (
                <p className="font-mono text-[11px] break-all text-ink-400">
                  {attempt.providerPaymentId}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function ConfirmPaymentDialog({ open, order, onClose, onDone, onConflict }) {
  const toast = useToast();
  // Blank on every open: the parent remounts this dialog by key rather
  // than clearing these from an effect.
  const [reference, setReference] = useState("");
  const [fieldError, setFieldError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setFieldError(null);

    try {
      onDone(await confirmPayment(order.id, { reference }));
    } catch (err) {
      if (err?.fields?.reference) {
        setFieldError(err.fields.reference);
      } else {
        toast.error(err?.message || "Could not confirm that payment.");
        if (err?.status === 409) {
          onClose();
          onConflict();
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirm this payment?"
      requirement="F-09.05"
      description={`${order.orderNumber} · ${money(order.total, { precise: true })} from ${order.contact.name}.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" busy={busy} onClick={run}>
            Confirm payment
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-600">
          This marks the order paid and accepts it, so it moves into the pack
          queue. Only do it once the money is actually in the account — the
          shopper is told their pieces are being picked.
        </p>

        <Field
          label="Payment reference"
          error={fieldError}
          hint={
            fieldError
              ? undefined
              : "A UPI transaction id or bank reference. Optional, but it is the only link back to the transfer. Kept internally."
          }
        >
          <Input
            value={reference}
            invalid={Boolean(fieldError)}
            placeholder="e.g. 431029884416"
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

function CancelOrderDialog({ open, order, onClose, onDone, onConflict }) {
  const toast = useToast();
  // Blank on every open — see the note in ConfirmPaymentDialog.
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setFieldError(null);

    try {
      onDone(await cancelOrder(order.id, { reason }));
    } catch (err) {
      if (err?.fields?.reason) {
        setFieldError(err.fields.reason);
      } else {
        toast.error(err?.message || "Could not cancel that order.");
        if (err?.status === 409) {
          onClose();
          onConflict();
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancel this order?"
      requirement="F-09.05"
      description={`${order.orderNumber} · ${number(order.unitCount)} ${
        order.unitCount === 1 ? "piece" : "pieces"
      } from ${order.contact.name}.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep the order
          </Button>
          <Button
            variant="danger"
            busy={busy}
            disabled={reason.trim() === ""}
            onClick={run}
          >
            Cancel order
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-600">
          Every piece on this order goes back on the shelf and becomes buyable
          again. This cannot be undone — a cancelled order stays cancelled, and
          the customer would have to place a new one.
        </p>

        <Field
          label="Reason"
          required
          error={fieldError}
          hint={
            fieldError
              ? undefined
              : "The customer will ask about this. Say what happened — payment never arrived, out of stock, cancelled by request."
          }
        >
          <Textarea
            rows={3}
            value={reason}
            invalid={Boolean(fieldError)}
            placeholder="Payment not received after three days."
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
