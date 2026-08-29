import { ArrowRight } from "lucide-react";
import Link from "next/link";

// Only features with screens in this frontend (FRS §5 Screen Inventory).
// F-01 Authentication & Authorization and F-10 Payment are backend-side work
// (sessions, tokens, role checks, gateway integration) and are not tracked here.
const FEATURES = [
  {
    id: "F-02",
    name: "Category Management",
    href: "/admin/category",
  },
  { id: "F-03", name: "Product Management", href: "/admin/products" },
  { id: "F-04", name: "Inventory Management", href: null },
  { id: "F-05", name: "Customer Management", href: null },
  { id: "F-06", name: "Product Browsing & Search", href: "/" },
  { id: "F-07", name: "Cart", href: null },
  { id: "F-08", name: "Address & Checkout", href: null },
  { id: "F-09", name: "Order Management", href: null },
  { id: "F-11", name: "Dashboard & Reports", href: null },
];

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
          Features ship one at a time in the FRS order: Database → API → UI → Integration → Test.
          This tracker lists only the features with screens in this frontend. The customer
          storefront now owns <code className="font-mono text-xs text-brand-600">/</code>; this
          page moved to <code className="font-mono text-xs text-brand-600">/dev</code>.
        </p>

        <ul className="mt-8 divide-y divide-ink-200 overflow-hidden rounded-xl bg-white ring-1 ring-ink-200">
          {FEATURES.map((feature) =>
            feature.href ? (
              <li key={feature.id}>
                <Link
                  href={feature.href}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-brand-50"
                >
                  <span className="font-mono text-xs text-brand-600">{feature.id}</span>
                  <span className="text-sm font-medium text-ink-900">{feature.name}</span>
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                    UI ready
                    <ArrowRight className="size-3" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ) : (
              <li key={feature.id} className="flex items-center gap-3 px-4 py-3">
                <span className="font-mono text-xs text-ink-300">{feature.id}</span>
                <span className="text-sm text-ink-400">{feature.name}</span>
                <span className="ml-auto text-[11px] text-ink-300">not started</span>
              </li>
            ),
          )}
        </ul>

        <p className="mt-6 text-xs text-ink-500">
          The Product Management screens run on static seed data — no API or database is required to
          demo them.
        </p>
        <p className="mt-2 text-xs text-ink-400">
          F-01 Authentication &amp; Authorization and F-10 Payment are backend work (sessions,
          tokens, role checks, payment gateway) and are tracked outside this UI.
        </p>
      </main>
    </div>
  );
}
