"use client";

/**
 * One chart, edited (`/admin/size-charts/[id]/edit`).
 *
 * The chart is read by id rather than handed over from the list, which
 * is the point of the route: the link survives a reload, a bookmark and
 * a second tab, none of which the dialog this replaced could do.
 *
 * The save is a full replace — see lib/api/sizeCharts — so the form
 * sends the whole chart back and there is nothing to diff.
 */

import { ArrowLeft } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import SizeChartForm from "@/components/admin/SizeChartForm";
import {
  ErrorNotice,
  LinkButton,
  SkeletonRows,
  useToast,
} from "@/components/admin/ui";
import { getSizeChart, updateSizeChart } from "@/lib/api/sizeCharts";

export default function EditSizeChartPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();

  const id = params?.id;

  const [loaded, setLoaded] = useState({ chart: null, error: null });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    getSizeChart(id, { signal: controller.signal })
      .then((chart) => {
        if (active) setLoaded({ chart, error: null });
      })
      .catch((error) => {
        if (active && error?.name !== "AbortError") {
          setLoaded({ chart: null, error });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [id, reload]);

  if (loaded.error) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <LinkButton variant="ghost" href="/admin/size-charts">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to size charts
        </LinkButton>
        <ErrorNotice
          error={loaded.error}
          onRetry={() => {
            setLoaded({ chart: null, error: null });
            setReload((n) => n + 1);
          }}
        />
      </div>
    );
  }

  if (!loaded.chart) {
    return <SkeletonRows rows={8} className="mx-auto max-w-5xl" />;
  }

  return (
    <SizeChartForm
      // Keyed on the chart, so landing on a different one from this same
      // route re-seeds the draft rather than showing the last chart's
      // measurements under the new one's name.
      key={loaded.chart.id}
      chart={loaded.chart}
      editing
      onSave={async (draft) => {
        const saved = await updateSizeChart(loaded.chart.id, draft);

        toast.success(
          "Size chart updated",
          `${saved.fit} — ${saved.rows.length} size${saved.rows.length === 1 ? "" : "s"}.`,
        );
        router.push("/admin/size-charts");
      }}
      onCancel={() => router.push("/admin/size-charts")}
    />
  );
}
