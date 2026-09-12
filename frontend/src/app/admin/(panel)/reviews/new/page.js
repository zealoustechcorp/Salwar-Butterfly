"use client";

/**
 * A new review (`/admin/reviews/new`).
 *
 * The catalogue is read here rather than in the form, for the product
 * picker. A failed read costs the picker and nothing else: the form
 * still renders and says why it cannot save.
 *
 * A refused save is re-thrown so the form keeps what was typed and shows
 * the API's field errors in place.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import ReviewForm from "@/components/admin/ReviewForm";
import { useToast } from "@/components/admin/ui";
import { listAllProducts } from "@/lib/api/products";
import { createReview } from "@/lib/api/reviews";

export default function NewReviewPage() {
  const router = useRouter();
  const toast = useToast();

  const [products, setProducts] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    listAllProducts({ signal: controller.signal })
      .then((rows) => {
        if (active) setProducts(rows);
      })
      .catch(() => {
        // The picker's problem, not the page's — the form says so.
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return (
    <ReviewForm
      products={products}
      onSave={async (input) => {
        const saved = await createReview(input);

        toast.success("Review added", saved.product.name);
        router.push("/admin/reviews");
      }}
      onCancel={() => router.push("/admin/reviews")}
    />
  );
}
