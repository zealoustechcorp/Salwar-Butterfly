/**
 * @file layout.js
 * @description Section title for `/admin/products`.
 *
 * The pages under this segment are client components, which cannot export
 * `metadata`; this pass-through server layout carries the title instead,
 * and the admin layout's title template wraps it.
 */

export const metadata = {
  title: "Products",
};

export default function ProductsSectionLayout({ children }) {
  return children;
}
