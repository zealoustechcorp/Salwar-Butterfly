import { CreditCard, PackageSearch, Ruler, Truck } from "lucide-react";
import Link from "next/link";

import { AccountPanel } from "@/components/store/AccountPanel";
import { getShop } from "@/lib/store/catalogue";

export const metadata = {
  title: "Your account",
  description:
    "Your Salwar Butterfly bag and wishlist, order help on WhatsApp, and how delivery, sizing and payment work.",
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
 * The shop still handles orders themselves on WhatsApp, so tracking points
 * there rather than at a self-service page that does not exist.
 */
export default function AccountPage() {
  const shop = getShop();

  const help = [
    {
      id: "orders",
      icon: PackageSearch,
      title: "Track your order",
      body: "Order updates come from the shop directly. Send your order details on WhatsApp and it will tell you where the parcel is — there is no self-service tracking page yet.",
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
      body: "Sizes run 36 to 46, and each piece lists only the sizes still in stock. If you are between two sizes, take the larger one — a size issue can be exchanged. For the exact measurements of a particular piece, ask on WhatsApp before ordering.",
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

      <h2 className="mt-10 font-display text-2xl font-semibold text-sb-heading sm:text-3xl">
        Before and after you order
      </h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {help.map(({ id, icon: Icon, title, body }) => (
          <div
            key={id}
            id={id}
            className="scroll-mt-40 rounded-2xl border border-sb-gold/35 bg-sb-bg p-5 sm:p-6 wide:scroll-mt-28"
          >
            <Icon className="size-6 text-sb-gold-text" aria-hidden="true" />
            <p className="mt-3 font-display text-xl font-semibold text-sb-heading">{title}</p>
            <p className="mt-2 text-sm leading-relaxed text-sb-text">{body}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-sm text-sb-text-muted">
        Exchanges are covered on the{" "}
        <Link href="/#policy" className="font-semibold text-sb-link underline underline-offset-4">
          returns policy
        </Link>{" "}
        on the home page. Reach the shop on WhatsApp, on{" "}
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
