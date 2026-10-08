import { CreditCard, PackageSearch, Ruler, Truck } from "lucide-react";
import Link from "next/link";

import { AccountPanel } from "@/components/store/AccountPanel";
import { OrderHistory } from "@/components/store/OrderHistory";
import { SizeChartButton } from "@/components/store/SizeChart";
import { getShop } from "@/lib/store/catalogue";

export const metadata = {
  title: "Your account",
  description:
    "Your Salwar Butterfly orders, bag and wishlist, and how delivery, sizing and payment work.",
};

/**
 * The account screen behind the header's person icon.
 *
 * Two halves, deliberately. <AccountPanel> is the signed-in half: it gates
 * itself and shows the bag and wishlist once there is an account behind them.
 * Everything below it — delivery, sizing, payment, how to chase an order — is
 * public, because the footer's Help column links straight to these anchors and
 * a guest asking about the size guide should not meet a wall.
 *
 * <OrderHistory> sits between them and gates itself the same way: orders are
 * a signed-in shopper's, and a guest sees nothing there but is pointed at
 * /track, which needs only their order number.
 */
export default function AccountPage() {
  const shop = getShop();

  const help = [
    {
      // The footer's Help column links straight at this anchor, so it stays
      // put and stays public — <OrderHistory> owns #my-orders instead, and a
      // guest following this link still lands on an answer.
      id: "orders",
      icon: PackageSearch,
      title: "Track your order",
      body: "Signed in, every order you have placed is listed above. Ordered as a guest? Use the order number from your confirmation and the email you placed it with on the tracking page — no account needed.",
    },
    {
      id: "delivery",
      icon: Truck,
      title: "Shipping & delivery",
      body: "Shipping is free all over India. Orders reach you in 5 to 10 working days once payment is confirmed. Every outfit is QC-checked before it is dispatched.",
    },
    {
      id: "sizes",
      icon: Ruler,
      title: "Size guide",
      // No "a size issue can be exchanged" here: the published policy only
      // covers a size *we* got wrong, so promising more would be a promise
      // the shop does not keep.
      body: "Sizes run 36 to 46, and each piece lists only the sizes still in stock. If you are between two sizes, take the larger one. A size you chose yourself is not a return reason, so for the exact measurements of a particular piece, ask on WhatsApp before you order.",
      // The footer's "Size guide" link lands here, so the charts themselves
      // have to be one click away from this card and not somewhere else.
      action: <SizeChartButton variant="outline" label="View the size chart" />,
    },
    {
      id: "payment",
      icon: CreditCard,
      title: "Payment",
      body: "Payment is online only — UPI through GPay, PhonePe, Paytm and more, or cards and net banking through the shop's payment gateway. There is no cash on delivery. Salwar Butterfly is a GST-registered seller and invoices every order.",
    },
  ];

  return (
    <section className="mx-auto max-w-4xl px-4 py-9 sm:px-6 sm:py-11 lg:px-8 lg:py-13">
      <p className="sb-eyebrow text-[10px] text-sb-gold-text">Your Account</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
        Everything about your order
      </h1>

      <AccountPanel />

      {/* The shop's name and logo, for the payment sheet an unpaid order
          can open from this list. */}
      <OrderHistory shop={shop} />

      <h2 className="mt-10 font-display text-2xl font-semibold text-sb-heading sm:text-3xl">
        Before and after you order
      </h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {help.map(({ id, icon: Icon, title, body, action }) => (
          <div
            key={id}
            id={id}
            className="scroll-mt-40 rounded-2xl border border-sb-gold/35 bg-sb-bg p-5 sm:p-6 wide:scroll-mt-28"
          >
            <Icon className="size-6 text-sb-gold-text" aria-hidden="true" />
            <p className="mt-3 font-display text-xl font-semibold text-sb-heading">{title}</p>
            <p className="mt-2 text-sm leading-relaxed text-sb-text">{body}</p>
            {action ? <div className="mt-4">{action}</div> : null}
          </div>
        ))}
      </div>

      <p className="mt-6 text-sm text-sb-text-muted">
        Returns, refunds and exchanges are set out in full in the{" "}
        <Link href="/returns" className="font-semibold text-sb-link underline underline-offset-4">
          return &amp; refund policy
        </Link>
        . Reach the shop on WhatsApp, on{" "}
        <a href={`tel:+91${shop.phone}`} className="font-semibold text-sb-link underline underline-offset-4 tabular">
          +91 {shop.phone}
        </a>
        , or at{" "}
        <a
          href={`mailto:${shop.email}`}
          className="font-semibold break-all text-sb-link underline underline-offset-4"
        >
          {shop.email}
        </a>
        .
      </p>
    </section>
  );
}
