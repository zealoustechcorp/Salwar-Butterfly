"use client";

/**
 * A new fit (`/admin/size-charts/new`).
 *
 * Mounts <SizeChartForm> on a blank chart. The chart lands last in the
 * print order — the list screen's arrows move it — so there is nothing
 * to choose here beyond the table itself.
 *
 * A refused save is re-thrown so the form keeps what was typed and marks
 * the cells the API named. Forty transcribed rows are not worth losing
 * to a duplicate fit name.
 */

import { useRouter } from "next/navigation";

import SizeChartForm from "@/components/admin/SizeChartForm";
import { BLANK_CHART } from "@/components/admin/SizeChartBuilder";
import { useToast } from "@/components/admin/ui";
import { createSizeChart } from "@/lib/api/sizeCharts";

export default function NewSizeChartPage() {
  const router = useRouter();
  const toast = useToast();

  return (
    <SizeChartForm
      chart={BLANK_CHART}
      onSave={async (draft) => {
        const saved = await createSizeChart(draft);

        toast.success(
          "Size chart published",
          `${saved.fit} — ${saved.rows.length} size${saved.rows.length === 1 ? "" : "s"}.`,
        );
        router.push("/admin/size-charts");
      }}
      onCancel={() => router.push("/admin/size-charts")}
    />
  );
}
