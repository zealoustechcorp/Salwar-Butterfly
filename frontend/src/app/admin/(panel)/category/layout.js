"use client";

/**
 * @file layout.js
 * @description Layout boundary wrapper for the `/admin/category` route segment (F-02 Catalogue).
 * 
 * Architectural Role:
 * - Mounts `<CategoryProvider>` once at the root of the category sub-tree.
 * - Ensures category state (creations, edits, active toggles) persists seamlessly
 *   during client-side Next.js navigation between `/admin/category` (list),
 *   `/admin/category/new` (creation), `/admin/category/[id]` (detail),
 *   and `/admin/category/[id]/edit` (editor).
 */

import { CategoryProvider } from "@/lib/categories/context";

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

