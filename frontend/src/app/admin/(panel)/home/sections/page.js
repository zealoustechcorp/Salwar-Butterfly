"use client";

/**
 * The two home page sections (F-06): Best sellers and the custom section.
 *
 * Both are fixed — nothing is added, deleted or reordered here. Each card
 * shows the section's current name and how many products it holds, and
 * opens the section's page, where the name, the description and the
 * products are changed. A section with no products is hidden from the home
 * page, and the card says so.
 */

import { ChevronRight, LayoutList } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge, Card, CardHeader, ErrorNotice, SkeletonRows } from "@/components/admin/ui";
import { SECTION_HINTS, listSections } from "@/lib/api/homeSections";

export default function HomeSectionsPage() {
  const [state, setState] = useState({ status: "loading", sections: [], error: null });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    listSections({ signal: controller.signal })
      .then((sections) => active && setState({ status: "ready", sections, error: null }))
      .catch((error) => {
        if (active && error?.name !== "AbortError") setState({ status: "error", sections: [], error });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reload]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHeader
          title="Home page sections"
          description="Two sections of hand-picked products on the home page. Change their names, descriptions and products. You can also tick products into them from any product's page."
        />

        {state.status === "loading" ? (
          <SkeletonRows rows={2} />
        ) : state.status === "error" ? (
          <div className="p-4">
            <ErrorNotice error={state.error} onRetry={() => setReload((n) => n + 1)} />
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {state.sections.map((section) => (
              <li key={section.key}>
                <Link
                  href={`/admin/home/sections/${section.key}`}
                  className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-ink-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                    <LayoutList className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-ink-900">{section.title}</span>
                      {section.productCount ? (
                        <Badge tone="green">On the home page</Badge>
                      ) : (
                        <Badge tone="neutral">Hidden: no products</Badge>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-500">
                      {section.productCount} {section.productCount === 1 ? "product" : "products"} ·{" "}
                      {section.key === "custom" ? "Custom section. " : ""}
                      {SECTION_HINTS[section.key]}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-ink-400" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
