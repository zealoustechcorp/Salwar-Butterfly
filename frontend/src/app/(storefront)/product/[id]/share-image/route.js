import sharp from "sharp";

import { getStorefrontProduct } from "@/lib/store/catalogue";

/**
 * `/product/<id>/share-image` — the picture a shared product link unfurls
 * with. generateMetadata in ../page.js points og:image and twitter:image here.
 *
 * Not the product photo itself. Those are the admin's uploads as they came
 * off the phone, mostly 500–800 KB, and WhatsApp silently drops an og:image
 * over roughly 300 KB: the link unfurls with a title and no picture. This
 * re-encodes the photo as a 1200×630 JPEG, the card size every platform
 * expects, which lands around 100 KB.
 *
 * The photo is portrait and the card is landscape, so it is fitted whole
 * over a blurred, cropped copy of itself rather than cropped — the garment
 * is the point, and a crop would cut off either the neckline or the hem.
 *
 * Only ever fetches the product's own catalogue photo, never a URL from the
 * request, so this cannot be pointed at an arbitrary address.
 */

export const runtime = "nodejs";

const WIDTH = 1200;
const HEIGHT = 630;

// A day at the edge, a week stale while it refreshes. A product's lead
// photo rarely changes, and a crawler that caches a preview keeps it far
// longer than this anyway.
const CACHE_CONTROL =
  "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(_request, { params }) {
  const { id } = await params;
  const product = await getStorefrontProduct(id);

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

    const card = await sharp(backdrop)
      .composite([{ input: subject, gravity: "center" }])
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();

    return new Response(card, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(card.length),
        "Cache-Control": CACHE_CONTROL,
      },
    });
  } catch (error) {
    console.warn(`[share-image] ${id}: ${error.message}`);

    // A preview with the heavy photo beats a preview with none: some
    // platforms take it, and WhatsApp is no worse off than before.
    return Response.redirect(product.image, 302);
  }
}
