"use client";

/**
 * @file page.js
 * @description Dynamic Category Edit Page Controller (`/admin/category/[id]/edit`, F-02.03).
 * Loads an existing category from `CategoryContext` by ID and mounts `CategoryForm` in edit mode.
 * On submission:
 * 1. Invokes `saveCategory(data)` in CategoryContext to persist modifications.
 * 2. Emits an informative toast notifying the administrator of saved changes.
 * 3. Redirects the user back to the category detail view (`/admin/category/[id]`).
 */

import { FolderX } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Button, EmptyState, useToast } from "@/components/admin/ui";
import { useCategories } from "@/lib/categories/context";
import CategoryForm from "@/components/categories/CategoryForm";

/**
 * EditCategoryPage Component
 *
 * Route segment page for modifying an existing category's properties, size charts, and linked products.
 *
 * @returns {JSX.Element} The rendered CategoryForm edit view or 404 EmptyState
 */
export default function EditCategoryPage() {
  /**
   * Next.js dynamic route parameter extracted from URL `/admin/category/[id]/edit`
   */
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();
  const { categories, saveCategory } = useCategories();

  /**
   * Resolves existing category record by ID
   */
  const category = categories.find((c) => c.id === id);

  /* Render fallback empty state if category ID is invalid or not found */
  if (!category) {
    return (
      <div className="max-w-xl rounded-xl bg-white p-8 ring-1 ring-ink-200/80 shadow-xs">
        <EmptyState
          title="Category not found"
          description="The category you are trying to edit does not exist."
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

  /* Render CategoryForm initialized with existing category data */
  return (
    <CategoryForm
      initial={category}
      /* Callback executed when the administrator saves changes */
      onSave={(data) => {
        saveCategory(data);
        toast.success("Category updated", `Changes to ${data.name} were saved.`);
        router.push(`/admin/category/${id}`);
      }}
      /* Callback executed when the administrator cancels editing */
      onCancel={() => router.push(`/admin/category/${id}`)}
    />
  );
}

