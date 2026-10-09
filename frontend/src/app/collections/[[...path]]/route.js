import { NextResponse } from "next/server";

import { resolveLegacyHandle } from "@/lib/store/legacyUrls";

/**
 * `/collections`, `/collections/<handle>` and
 * `/collections/<handle>/products/<handle>` — the previous site's addresses,
 * still in search results. Permanent, so search engines replace them with
 * where they lead now. See lib/store/legacyUrls.js.
 */
export async function GET(request, { params }) {
  const { path = [] } = await params;

  const target =
    path[1] === "products" && path[2]
      ? await resolveLegacyHandle(path[2], { products: true })
      : await resolveLegacyHandle(path[0]);

  return NextResponse.redirect(new URL(target, request.url), 308);
}
