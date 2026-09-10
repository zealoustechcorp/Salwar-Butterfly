import { ArrowRight } from "lucide-react";
import Link from "next/link";

// Only features with screens in this frontend. Authentication & authorization
// is backend-side work — sessions, tokens and role checks — and is not tracked
// here. Features are listed by name only: the spec's numbering is internal and
// is never shown in the UI.
//
// There used to be a third state on this list, "UI on snapshot data", for
// storefront screens that were finished but still rendering from a committed
// JSON export rather than the database. There is nothing left in it: the API
// grew a public read router (/storefront), lib/store/catalogue.js fetches it,
// and the snapshot file is gone. Every screen below either reads the live API
// or does not exist yet, which is why two states are now enough.
const FEATURES = [
  {
    name: "Categories Management",
    href: "/admin/category",
    status: "live",
  },
  { name: "Product Management", href: "/admin/products", status: "live" },
  { name: "Inventory Management", href: "/admin/inventory", status: "live" },
  { name: "Customer Management", href: "/admin/customers", status: "live" },
  { name: "Product Browsing & Search", href: "/", status: "live" },
  { name: "Cart & Wishlist", href: "/bag", status: "live" },
  { name: "Address & Checkout", href: "/checkout", status: "live" },
  { name: "Order Management", href: "/admin/orders", status: "live" },
  // The gateway itself is backend work, but it has a screen now: the
  // confirmation page opens the payment sheet, and retries it.
  { name: "Payment", href: "/checkout/done", status: "live" },
  // The dashboard replaced the redirect that used to sit on /admin;
  // reviews are the admin-only page the spec asks for, not a storefront
  // feature — showing them on a product page is a separate screen.
  { name: "Dashboard & Reports", href: "/admin", status: "live" },
  { name: "Reviews & Ratings", href: "/admin/reviews", status: "live" },
];

const STATUS_BADGE = {
  live: {
    label: "Live on API",
    className:
      "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
};

export default function BuildTracker() {
  return (
    <div className="admin-root flex flex-1 justify-center px-6 py-16">
      <main className="w-full max-w-2xl">
        <p className="text-xs font-semibold tracking-widest text-brand-600 uppercase">
          Salwar Butterfly
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900">
          Single-Seller E-Commerce — build tracker
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-600">
          Features ship one at a time, in order: Database → API → UI → Integration → Test.
          This tracker lists only the features with screens in this frontend. The customer
          storefront now owns <code className="font-mono text-xs text-brand-600">/</code>; this
          page moved to <code className="font-mono text-xs text-brand-600">/dev</code>.
        </p>

        <p className="mt-3 text-sm leading-relaxed text-ink-600">
          The storefront reads the catalogue from{" "}
          <code className="font-mono text-xs text-brand-600">GET /storefront/getCatalogue</code>{" "}
          and revalidates every minute, so a sold-out size stops being offered without a
          redeploy. Payment runs through Razorpay and confirms twice over — on the checkout
          return and again on a signed webhook — so an order still confirms when the shopper
          closes the tab.
        </p>

        <ul className="mt-8 divide-y divide-ink-200 overflow-hidden rounded-xl bg-white ring-1 ring-ink-200">
          {FEATURES.map((feature) =>
            feature.href ? (
              <li key={feature.name}>
                <Link
                  href={feature.href}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-brand-50"
                >
                  <span className="text-sm font-medium text-ink-900">{feature.name}</span>
                  <span
                    className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                      (STATUS_BADGE[feature.status] ?? STATUS_BADGE.live).className
                    }`}
                  >
                    {(STATUS_BADGE[feature.status] ?? STATUS_BADGE.live).label}
                    <ArrowRight className="size-3" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ) : (
              <li key={feature.name} className="flex items-center gap-3 px-4 py-3">
                <span className="text-sm text-ink-400">{feature.name}</span>
                <span className="ml-auto text-[11px] text-ink-300">not started</span>
              </li>
            ),
          )}
        </ul>

        <p className="mt-6 text-xs text-ink-400">
          Authentication &amp; Authorization is backend work (sessions, tokens, role
          checks) and is tracked outside this UI.
        </p>
      </main>
    </div>
  );
}
