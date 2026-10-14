/**
 * @file layout.js
 * @description Section title for `/admin/orders`.
 *
 * The pages under this segment are client components, which cannot export
 * `metadata`; this pass-through server layout carries the title instead,
 * and the admin layout's title template wraps it.
 */

export const metadata = {
  title: "Orders",
};

export default function OrdersSectionLayout({ children }) {
  return children;
}
