/**
 * @file layout.js
 * @description Section title for `/admin/inventory`.
 *
 * The pages under this segment are client components, which cannot export
 * `metadata`; this pass-through server layout carries the title instead,
 * and the admin layout's title template wraps it.
 */

export const metadata = {
  title: "Inventory",
};

export default function InventorySectionLayout({ children }) {
  return children;
}
