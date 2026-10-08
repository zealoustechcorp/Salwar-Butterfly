"use client";

/**
 * @file page.js
 * @description Create Category Page Controller (`/admin/category/new`).
 * Mounts `CategoryForm` in creation mode (without initial data).
 * On successful submission:
 * 1. `saveCategory(data)` POSTs to `/api/categories/createCategory` (multipart, so the
 *    banner file uploads with it) and moves any checked products into the new category.
 * 2. Emits a success toast alert notifying the administrator.
 * 3. Redirects the user back to the main categories list (`/admin/category`).
 *
 * A rejected save is re-thrown so the form can keep the admin's input and
 * show the API's field errors in place.
 */

import { useRouter } from "next/navigation";
import { useCategories } from "@/lib/categories/context";
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
  const { products, saveCategory } = useCategories();

  return (
    <CategoryForm
      products={products}
      /* Callback executed when the user saves the new category */
      onSave={async (data) => {
        const saved = await saveCategory(data);

        toast.success("Category created", `${saved.name} is now in the catalogue.`);
        router.push("/admin/category");
      }}
      /* Callback executed when the user cancels creation */
      onCancel={() => router.push("/admin/category")}
    />
  );
}
