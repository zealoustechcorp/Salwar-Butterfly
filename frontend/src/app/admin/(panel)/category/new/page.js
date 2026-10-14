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
 * show the API's field errors in place. A create that succeeded but whose
 * product move did not switches the form to editing the new category.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProductMoveError, useCategories } from "@/lib/categories/context";
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
  const { categories, products, productsError, saveCategory } = useCategories();

  /**
   * The category a create already wrote, when the product move after it
   * failed. From then on this screen edits that category: the same form
   * instance stays mounted (so the checked products survive), but with
   * `initial` set its next save is a PUT plus the move, not a second
   * create that would only be refused with "slug already exists".
   *
   * The context's copy is preferred once it has one; the saved record is
   * the fallback while the list is still loading.
   */
  const [created, setCreated] = useState(null);

  const initial = created
    ? (categories.find((c) => c.id === created.id) ?? { ...created, productIds: [] })
    : undefined;

  return (
    <CategoryForm
      initial={initial}
      products={products}
      productsError={productsError}
      /* Callback executed when the user saves the new category */
      onSave={async (data) => {
        try {
          const saved = await saveCategory(data);

          toast.success(
            created ? "Category updated" : "Category created",
            `${saved.name} is now in the catalogue.`,
          );
          router.push("/admin/category");
        } catch (saveError) {
          if (saveError instanceof ProductMoveError) setCreated(saveError.category);
          throw saveError;
        }
      }}
      /* Callback executed when the user cancels creation */
      onCancel={() => router.push("/admin/category")}
    />
  );
}
