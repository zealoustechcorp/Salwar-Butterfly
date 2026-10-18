"use client";

/**
 * "Show on the home page" — the product page's way into the two home page
 * sections (F-06): Best sellers and the custom section.
 *
 * One checkbox per section, saved the moment it is ticked; there is no Save
 * button to forget. The section names are the shop's current ones, so a
 * custom section renamed "Diwali Sale" reads as that here too. The same
 * ticks can be made from the section's own page; both write the same list.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import { Card, CardHeader, ErrorNotice, SkeletonRows, useToast } from "@/components/admin/ui";
import { getProductSections, listSections, setProductSections } from "@/lib/api/homeSections";

export function HomeSectionsCard({ productId }) {
  const toast = useToast();
  const [state, setState] = useState({ status: "loading", sections: [], ticked: [], error: null });
  const [busy, setBusy] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    Promise.all([
      listSections({ signal: controller.signal }),
      getProductSections(productId, { signal: controller.signal }),
    ])
      .then(([sections, ticked]) => active && setState({ status: "ready", sections, ticked, error: null }))
      .catch((error) => {
        if (active && error?.name !== "AbortError") {
          setState({ status: "error", sections: [], ticked: [], error });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [productId, reload]);

  async function toggle(section) {
    const on = !state.ticked.includes(section.key);
    const next = on ? [...state.ticked, section.key] : state.ticked.filter((key) => key !== section.key);

    setBusy(section.key);
    try {
      const ticked = await setProductSections(productId, next);
      setState((current) => ({ ...current, ticked }));
      toast.success(on ? `Added to ${section.title}` : `Removed from ${section.title}`);
    } catch (error) {
      toast.error("Could not update the home page", error?.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader title="Show on the home page" description="Tick a section to show this product in it." />

      {state.status === "loading" ? (
        <SkeletonRows rows={2} />
      ) : state.status === "error" ? (
        <div className="p-4">
          <ErrorNotice error={state.error} onRetry={() => setReload((n) => n + 1)} />
        </div>
      ) : (
        <div className="space-y-1 p-2">
          {state.sections.map((section) => (
            <label
              key={section.key}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-ink-50"
            >
              <input
                id={`home-section-${section.key}`}
                type="checkbox"
                checked={state.ticked.includes(section.key)}
                disabled={busy !== null}
                onChange={() => toggle(section)}
                className="size-4 shrink-0 accent-brand-600"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{section.title}</span>
              {busy === section.key ? <span className="text-xs text-ink-500">Saving…</span> : null}
            </label>
          ))}
          <p className="px-2 pt-1 text-xs text-ink-500">
            Rename them or change their products in{" "}
            <Link href="/admin/home/sections" className="font-medium text-brand-700 underline underline-offset-2">
              Home → Sections
            </Link>
            .
          </p>
        </div>
      )}
    </Card>
  );
}
