"use client";

/**
 * @file page.js
 * @description Dynamic Category Detail Page Controller (`/admin/category/[id]`).
 * Extracts the dynamic `id` route parameter, resolves the matching category from the
 * API-backed `CategoryContext`, and renders the `CategoryDetail` inspector view.
 *
 * Three outcomes rather than two: the collection is still loading, it failed
 * to load, or it loaded and this id is genuinely not in it — only the last
 * of which is a "not found".
 */

import { FolderX } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import {
  Button,
  EmptyState,
  ErrorNotice,
  SkeletonRows,
  useToast,
} from "@/components/admin/ui";
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
  const toast = useToast();
  const { categories, products, status, error, refresh, toggleActive } =
    useCategories();

  if (status === "loading") {
    return (
      <div className="rounded-xl bg-white ring-1 ring-ink-200/80 shadow-xs">
        <SkeletonRows rows={5} />
      </div>
    );
  }

  if (status === "error") {
    return <ErrorNotice error={error} onRetry={refresh} />;
  }

  /**
   * Finds matching category record by ID
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

  /**
   * Products the API reports against this category.
   */
  const linkedProducts = products.filter((p) => p.categoryId === category.id);

  const handleToggle = async () => {
    try {
      await toggleActive(category.id);
    } catch (toggleError) {
      toast.error(
        "Could not update category",
        toggleError?.message ?? "The change was not saved.",
      );
    }
  };

  /* Render detail view with navigation handlers and toggle action */
  return (
    <CategoryDetail
      category={category}
      products={linkedProducts}
      /* Navigate to category edit screen */
      onEdit={() => router.push(`/admin/category/${id}/edit`)}
      /* Navigate back to category list screen */
      onBack={() => router.push("/admin/category")}
      /* Toggle category active/inactive visibility */
      onToggle={handleToggle}
    />
  );
}
