"use client";

/**
 * @file page.js
 * @description Admin Category Index Page Controller (`/admin/category`).
 * Connects the `CategoryList` component with Next.js navigation router and contextual toast alerts:
 * - Directs user to `/admin/category/new` on "+ Add category".
 * - Directs user to `/admin/category/[id]/edit` on "Edit".
 * - Directs user to `/admin/category/[id]` on "View".
 * - Fires informative toast confirmations whenever an admin toggles a category's visibility.
 *
 * Categories come from the API, so this page also owns the two states a
 * static list never had: the first load, and a backend that did not answer.
 */

import { useRouter } from "next/navigation";
import { ErrorNotice, SkeletonRows, useToast } from "@/components/admin/ui";
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
  const { categories, status, error, refresh, toggleActive } = useCategories();

  /**
   * Toggles the active status of a category and shows a feedback toast notification
   * informing the admin whether the category is now visible to customers or hidden.
   *
   * The optimistic flip lives in the provider; a rejection rolls it back,
   * so the toast here reports what the API actually did.
   *
   * @param {string} id - Target category ID
   */
  const handleToggle = async (id) => {
    const target = categories.find((c) => c.id === id);
    if (!target) return;

    try {
      await toggleActive(id);

      toast.info(
        target.active ? "Category hidden" : "Category activated",
        `${target.name} is now ${target.active ? "hidden from" : "visible on"} the storefront.`,
      );
    } catch (toggleError) {
      toast.error(
        "Could not update category",
        toggleError?.message ?? "The change was not saved.",
      );
    }
  };

  if (status === "loading") {
    return (
      <div className="rounded-xl bg-white ring-1 ring-ink-200/80 shadow-xs">
        <SkeletonRows rows={6} />
      </div>
    );
  }

  if (status === "error") {
    return <ErrorNotice error={error} onRetry={refresh} />;
  }

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
