/**
 * @file layout.js
 * @description Layout boundary wrapper for the `/admin/category` route segment.
 * 
 * Architectural Role:
 * - Mounts `<CategoryProvider>` once at the root of the category sub-tree.
 * - Ensures category state (creations, edits, active toggles) persists seamlessly
 *   during client-side Next.js navigation between `/admin/category` (list),
 *   `/admin/category/new` (creation), `/admin/category/[id]` (detail),
 *   and `/admin/category/[id]/edit` (editor).
 *
 * A server component on purpose: the provider is the client boundary, and
 * keeping this file on the server is what lets it export `metadata` — the
 * section title the admin layout's title template wraps.
 */

import { CategoryProvider } from "@/lib/categories/context";

export const metadata = {
  title: "Categories",
};

/**
 * CategoriesLayout Component
 *
 * @param {Object} props - Layout properties
 * @param {React.ReactNode} props.children - Nested route segment pages
 * @returns {JSX.Element} The CategoryProvider context provider enclosing child pages
 */
export default function CategoriesLayout({ children }) {
  return <CategoryProvider>{children}</CategoryProvider>;
}

