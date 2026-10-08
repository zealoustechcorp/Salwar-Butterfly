"use client";

/**
 * One review, edited (`/admin/reviews/[id]/edit`).
 *
 * The review is read by id rather than handed over from the list, which
 * is the point of the route: the link survives a reload, a bookmark and
 * a second tab, none of which the dialog this replaced could do.
 *
 * No catalogue is loaded here. A review cannot be moved to another
 * product, so the form prints the one it is on rather than offering a
 * picker — see the note in ReviewForm.
 */

import { ArrowLeft } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import ReviewForm from "@/components/admin/ReviewForm";
import {
  ErrorNotice,
  LinkButton,
  SkeletonRows,
  useToast,
} from "@/components/admin/ui";
import { getReview, updateReview } from "@/lib/api/reviews";

export default function EditReviewPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();

  const id = params?.id;

  const [loaded, setLoaded] = useState({ review: null, error: null });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    getReview(id, { signal: controller.signal })
      .then((review) => {
        if (active) setLoaded({ review, error: null });
      })
      .catch((error) => {
        if (active && error?.name !== "AbortError") {
          setLoaded({ review: null, error });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [id, reload]);

  if (loaded.error) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <LinkButton variant="ghost" href="/admin/reviews">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to reviews
        </LinkButton>
        <ErrorNotice
          error={loaded.error}
          onRetry={() => {
            setLoaded({ review: null, error: null });
            setReload((n) => n + 1);
          }}
        />
      </div>
    );
  }

  if (!loaded.review) {
    return <SkeletonRows rows={6} className="mx-auto max-w-3xl" />;
  }

  return (
    <ReviewForm
      // Keyed on the review, so landing on a different one from this same
      // route re-seeds the form rather than showing the last review's
      // words under the new one's name.
      key={loaded.review.id}
      review={loaded.review}
      onSave={async (patch) => {
        const saved = await updateReview(loaded.review.id, patch);

        toast.success("Review updated", saved.product.name);
        router.push("/admin/reviews");
      }}
      onCancel={() => router.push("/admin/reviews")}
    />
  );
}
