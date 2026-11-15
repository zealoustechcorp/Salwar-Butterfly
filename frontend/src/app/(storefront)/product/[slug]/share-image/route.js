import sharp from "sharp";

import { SHARE_CARD } from "@/lib/site";
import { getStorefrontProductBySlug } from "@/lib/store/catalogue";

/**
 * `/product/<slug>/share-image` — the picture a shared product link unfurls
 * with. generateMetadata in ../page.js points og:image and twitter:image here.
 *
 * Not the product photo itself. Those are the admin's uploads as they came
 * off the phone, mostly 500–800 KB, and WhatsApp silently drops an og:image
 * over roughly 300 KB: the link unfurls with a title and no picture. This
 * re-encodes the photo as a square JPEG (SHARE_CARD in lib/site.js), kept
 * under MAX_BYTES.
 *
 * Square because the photos are 9:16 and WhatsApp shows a big square card
 * (the Myntra-style preview): the dress fills the full height. It is fitted
 * whole over a blurred, cropped copy of itself rather than cropped — the
 * garment is the point, and a crop would cut off the neckline or the hem —
 * so only two narrow strips at the sides are blur.
 *
 * Only ever fetches the product's own catalogue photo, never a URL from the
 * request, so this cannot be pointed at an arbitrary address.
 */

export const runtime = "nodejs";

const WIDTH = SHARE_CARD.width;
const HEIGHT = SHARE_CARD.height;

// Under WhatsApp's ~300 KB cut-off with room to spare. A busy photo that
// encodes larger at the first quality is re-encoded lower until it fits.
const MAX_BYTES = 250 * 1024;
const QUALITIES = [82, 72, 62, 52];

// A day at the edge, a week stale while it refreshes. A product's lead
// photo rarely changes, and a crawler that caches a preview keeps it far
// longer than this anyway.
const CACHE_CONTROL =
  "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(_request, { params }) {
  const { slug } = await params;
  const product = await getStorefrontProductBySlug(slug);

  if (!product?.image) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const upstream = await fetch(product.image, {
      next: { revalidate: 86400 },
    });
    if (!upstream.ok) throw new Error(`photo answered ${upstream.status}`);

    const photo = Buffer.from(await upstream.arrayBuffer());

    // `rotate()` with no argument applies the EXIF orientation, which a
    // phone photo nearly always carries and a resize would otherwise drop.
    const backdrop = await sharp(photo)
      .rotate()
      .resize(WIDTH, HEIGHT, { fit: "cover" })
      .blur(40)
      .modulate({ brightness: 0.9 })
      .toBuffer();

    const subject = await sharp(photo)
      .rotate()
      .resize(WIDTH, HEIGHT, { fit: "inside", withoutEnlargement: false })
      .toBuffer();

    const composed = await sharp(backdrop)
      .composite([{ input: subject, gravity: "center" }])
      .toBuffer();

    let card;
    for (const quality of QUALITIES) {
      card = await sharp(composed).jpeg({ quality, mozjpeg: true }).toBuffer();
      if (card.length <= MAX_BYTES) break;
    }

    return new Response(card, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(card.length),
        "Cache-Control": CACHE_CONTROL,
      },
    });
  } catch (error) {
    console.warn(`[share-image] ${slug}: ${error.message}`);

    // A preview with the heavy photo beats a preview with none: some
    // platforms take it, and WhatsApp is no worse off than before.
    return Response.redirect(product.image, 302);
  }
}
