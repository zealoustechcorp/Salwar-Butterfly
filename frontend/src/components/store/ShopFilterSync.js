"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { TABS, useBrowse } from "./BrowseProvider";

/**
 * Points the shared browse filter at `/shop`'s own query string.
 *
 * The header lives in the storefront layout, above every page, so its links
 * cannot reach into React state — they carry the filter in the URL instead
 * (`/shop?tab=offers`, `/shop?category=2`, `/shop?q=azrak`) and this reads it
 * back out on arrival. Anything the URL leaves out is reset to its default, so
 * landing on `/shop?tab=new` never inherits a category left over from an
 * earlier click.
 *
 * The sync is deliberately one-way. Once the page is open, the tabs, chips and
 * search box on it own the filter; re-writing the URL on every keystroke would
 * bury the back button under a stack of half-typed searches.
 */
export function ShopFilterSync({ categoryIds }) {
  const params = useSearchParams();
  const { applyParams } = useBrowse();

  const tab = params.get("tab");
  const category = params.get("category");
  const fabric = params.get("fabric");
  const query = params.get("q");
  // Compared by value: the array prop is re-created on every render of the
  // server page, and an identity dep would re-run this effect — undoing
  // whatever the shopper had just picked on the page itself.
  const knownIds = categoryIds.join(",");

  useEffect(() => {
    const numericCategory = Number(category);
    applyParams({
      tab: TABS.some((item) => item.id === tab) ? tab : "new",
      categoryId: knownIds.split(",").includes(String(numericCategory)) ? numericCategory : "all",
      fabric: fabric || "all",
      query: query || "",
    });
  }, [applyParams, knownIds, tab, category, fabric, query]);

  return null;
}
