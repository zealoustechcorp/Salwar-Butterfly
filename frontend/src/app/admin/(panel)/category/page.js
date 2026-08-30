"use client";

/**
 * @file page.js
 * @description Admin Category Index Page Controller (`/admin/category`, F-02 Catalogue).
 * Connects the `CategoryList` component with Next.js navigation router and contextual toast alerts:
 * - Directs user to `/admin/category/new` on "+ Add category".
 * - Directs user to `/admin/category/[id]/edit` on "Edit".
 * - Directs user to `/admin/category/[id]` on "View".
 * - Fires informative toast confirmations whenever an admin toggles a category's visibility.
 */

import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/ui";
import { useCategories } from "@/lib/categories/context";
import CategoryList from "@/components/categories/CategoryList";

/**
 * CategoriesPage Component
 *
 * Top-level route page rendering the category management dashboard.
 *
 * @returns {JSX.Element} The rendered CategoryList page view
 */
export default function CategoriesPage() {
  const router = useRouter();
  const toast = useToast();
  const { categories, toggleActive } = useCategories();

  /**
   * Toggles the active status of a category and shows a feedback toast notification
   * informing the admin whether the category is now visible to customers or hidden.
   *
   * @param {string|number} id - Target category ID
   */
  const handleToggle = (id) => {
    const target = categories.find((c) => c.id === id);
    toggleActive(id);
    if (target) {
      toast.info(
        target.active ? "Category hidden" : "Category activated",
        `${target.name} is now ${target.active ? "hidden from" : "visible on"} the storefront.`
      );
    }
  };

  return (
    <CategoryList
      categories={categories}
      /* Navigate to category creation screen */
      onAdd={() => router.push("/admin/category/new")}
      /* Navigate to category edit screen */
      onEdit={(c) => router.push(`/admin/category/${c.id}/edit`)}
      /* Navigate to category detail inspection screen */
      onDetail={(c) => router.push(`/admin/category/${c.id}`)}
      /* Handle instant visibility toggle with toast notification */
      onToggle={handleToggle}
    />
  );
}

