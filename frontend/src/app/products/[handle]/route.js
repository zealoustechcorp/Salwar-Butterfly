import { NextResponse } from "next/server";

import { resolveLegacyHandle } from "@/lib/store/legacyUrls";

/**
 * `/products/<handle>` — the previous site's product pages, still in search
 * results. Permanent, so search engines replace them with where they lead
 * now. See lib/store/legacyUrls.js.
 */
export async function GET(request, { params }) {
  const { handle } = await params;
  const target = await resolveLegacyHandle(handle, { products: true });

  return NextResponse.redirect(new URL(target, request.url), 308);
}
