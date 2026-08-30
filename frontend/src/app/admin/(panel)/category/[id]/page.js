"use client";

/**
 * @file page.js
 * @description Dynamic Category Detail Page Controller (`/admin/category/[id]`, F-02.01).
 * Extracts the dynamic `id` route parameter, queries the matching category from `CategoryContext`,
 * and renders the `CategoryDetail` inspector view.
 * If the category does not exist, renders an informative "Category not found" empty state.
 */

import { FolderX } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Button, EmptyState } from "@/components/admin/ui";
import { useCategories } from "@/lib/categories/context";
import CategoryDetail from "@/components/categories/CategoryDetail";

/**
 * CategoryDetailPage Component
 *
 * Dynamic route component for inspecting individual category records.
 *
 * @returns {JSX.Element} The rendered CategoryDetail view or 404 EmptyState
 */
export default function CategoryDetailPage() {
  /**
   * Next.js dynamic route parameter extracted from URL `/admin/category/[id]`
   */
  const { id } = useParams();
  const router = useRouter();
  const { categories, toggleActive } = useCategories();

  /**
   * Finds matching category object from context state by string/numeric ID
   */
  const category = categories.find((c) => c.id === id);

  /* Render fallback empty state if category ID does not exist in catalog */
  if (!category) {
    return (
      <div className="max-w-xl rounded-xl bg-white p-8 ring-1 ring-ink-200/80 shadow-xs">
        <EmptyState
          title="Category not found"
          description="The requested category could not be located in the catalog."
          icon={<FolderX className="size-6 text-red-500" />}
          action={
            <Button variant="secondary" size="sm" onClick={() => router.push("/admin/category")}>
              Back to categories
            </Button>
          }
        />
      </div>
    );
  }

  /* Render detail view with navigation handlers and toggle action */
  return (
    <CategoryDetail
      category={category}
      /* Navigate to category edit screen */
      onEdit={() => router.push(`/admin/category/${id}/edit`)}
      /* Navigate back to category list screen */
      onBack={() => router.push("/admin/category")}
      /* Toggle category active/inactive visibility */
      onToggle={() => toggleActive(id)}
    />
  );
}

