"use client";

/**
 * @file page.js
 * @description Create Category Page Controller (`/admin/category/new`, F-02.02).
 * Mounts `CategoryForm` in creation mode (without initial data).
 * On successful submission:
 * 1. Invokes `saveCategory(data)` in CategoryContext to append the new category.
 * 2. Emits a success toast alert notifying the administrator.
 * 3. Redirects the user back to the main categories list (`/admin/category`).
 */

import { useRouter } from "next/navigation";
import { useCategories } from "../../../../lib/categories/context";
import { useToast } from "@/components/admin/ui";
import CategoryForm from "@/components/categories/CategoryForm";

/**
 * NewCategoryPage Component
 *
 * Route segment page for defining and creating a new product category.
 *
 * @returns {JSX.Element} The rendered CategoryForm creation view
 */
export default function NewCategoryPage() {
  const router = useRouter();
  const toast = useToast();
  const { saveCategory } = useCategories();

  return (
    <CategoryForm
      /* Callback executed when the user saves the new category */
      onSave={(data) => {
        saveCategory(data);
        toast.success("Category created", `${data.name} is now in the catalogue.`);
        router.push("/admin/category");
      }}
      /* Callback executed when the user cancels creation */
      onCancel={() => router.push("/admin/category")}
    />
  );
}

