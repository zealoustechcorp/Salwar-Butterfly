"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { TABS } from "@/lib/store/filters";
import { useBrowse } from "./BrowseProvider";

/**
 * Points the shared browse filter at `/shop`'s own query string.
 *
 * The header lives in the storefront layout, above every page, so its links
 * cannot reach into React state — they carry the filter in the URL instead
 * (`/shop?tab=offers`, `/shop?category=2`, `/shop?q=azrak`) and this reads it
 * back out on arrival. Anything the URL leaves out is reset to its default, so
 * landing on `/shop?tab=new` never inherits a category left over from an
 * earlier click — and that now covers the sidebar's dimensions too: a size or
 * a price band picked on a previous visit does not survive a fresh link.
 *
 * The sync is deliberately one-way. Once the page is open, the rail, the tabs
 * and the search box on it own the filter; re-writing the URL on every
 * keystroke would bury the back button under a stack of half-typed searches.
 */
export function ShopFilterSync({ categoryIds, fabricNames, sizeLabels }) {
  const params = useSearchParams();
  const { applyParams } = useBrowse();

  const tab = params.get("tab");
  const category = params.get("category");
  const fabric = params.get("fabric");
  const size = params.get("size");
  const query = params.get("q");
  // Compared by value: the array props are re-created on every render of the
  // server page, and an identity dep would re-run this effect — undoing
  // whatever the shopper had just picked on the page itself.
  const knownIds = categoryIds.join("|");
  const knownFabrics = fabricNames.join("|");
  const knownSizes = sizeLabels.join("|");

  useEffect(() => {
    // Category ids are UUIDs and matched as opaque strings — they used to be
    // integers, and `Number("883e80b6-…")` is NaN, which silently reset every
    // `?category=` link in the header to "all".
    const known = knownIds.split("|");

    // Multi-select dimensions arrive comma-separated (`?fabric=Azrak,Ikkat`)
    // and are intersected with what the shop actually stocks: a stale link to
    // a fabric that has left the catalogue filters to nothing, which reads as
    // an empty shop rather than as a dead link.
    const pick = (value, allowed) => {
      if (!value) return [];
      const permitted = allowed.split("|");
      return value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => permitted.includes(item));
    };

    applyParams({
      tab: TABS.some((item) => item.id === tab) ? tab : "new",
      categoryId: category && known.includes(category) ? category : "all",
      fabrics: pick(fabric, knownFabrics),
      sizes: pick(size, knownSizes),
      query: query || "",
    });
  }, [applyParams, knownIds, knownFabrics, knownSizes, tab, category, fabric, size, query]);

  return null;
}
