"use client";

import { ArrowLeft } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DiscountDialog } from "@/components/admin/DiscountDialog";
import { ActiveDot, StatTile } from "@/components/admin/ProductBits";
import { GalleryThumbnail } from "@/components/admin/ProductGallery";
import { ProductCover } from "@/components/admin/ProductThumb";
import { ColourSwatch, StockBadge } from "@/components/admin/SizeStockEditor";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorNotice,
  LinkButton,
  SkeletonRows,
  useToast,
} from "@/components/admin/ui";
import { getProduct, getReference, setActive } from "@/lib/api/products";
import { EMPTY_SUMMARY, getVariantsForProduct } from "@/lib/api/variants";
import { money, number, shortDate } from "@/lib/format";

export default function ProductDetailPage() {
  const params = useParams();
  const id = params?.id;
  const toast = useToast();

  const [reload, setReload] = useState(0);
  const [result, setResult] = useState({
    product: null,
    reference: null,
    variants: [],
    summary: EMPTY_SUMMARY,
    error: null,
  });
  const [busy, setBusy] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);

  // Every setState here lands after an await, so the effect never triggers a
  // cascading render on mount.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    Promise.all([
      getProduct(id, { signal: controller.signal }),
      // The names behind category_id / sub_category_id. Not worth failing
      // the whole screen for.
      getReference({ signal: controller.signal }).catch(() => null),
      getVariantsForProduct(id, { signal: controller.signal }).catch(() => ({
        variants: [],
        summary: EMPTY_SUMMARY,
      })),
    ])
      .then(([product, reference, variantResult]) => {
        if (active)
          setResult({
            product,
            reference,
            variants: variantResult.variants,
            summary: variantResult.summary,
            error: null,
          });
      })
      .catch((err) => {
        if (active && err?.name !== "AbortError")
          setResult((current) => ({ ...current, error: err }));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [id, reload]);

  const load = useCallback(() => setReload((n) => n + 1), []);
  const { product, reference, variants, summary, error } = result;

  const names = useMemo(() => {
    if (!product) return { category: "—" };
    return {
      category:
        reference?.categories.find((c) => c.id === product.categoryId)?.name ?? "—",
    };
  }, [product, reference]);

  async function toggleActive() {
    setBusy(true);
    try {
      const outcome = await setActive({ productIds: [product.id], active: !product.active });
      toast.success(outcome.message);
      load();
    } catch (err) {
      toast.error(err.message || "Could not change availability.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !product)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <ErrorNotice error={error} onRetry={load} />
        <LinkButton href="/admin/products">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to products
        </LinkButton>
      </div>
    );

  if (!product) return <SkeletonRows rows={10} className="mx-auto max-w-6xl" />;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-ink-500">
        <LinkButton variant="ghost" size="sm" href="/admin/products">
          Products
        </LinkButton>
        <span aria-hidden="true">/</span>
        <span className="truncate font-medium text-ink-700">{product.name}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <ProductCover product={product} size={64} rounded="rounded-xl" />
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight text-ink-900">
              {product.name}
              {product.isFeatured ? <Badge tone="gold">Featured</Badge> : null}
              {product.discountPercentage > 0 ? (
                <Badge tone="brand">−{product.discountPercentage}% offer</Badge>
              ) : null}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <span className="font-mono">/{product.slug}</span>
              <span aria-hidden="true">·</span>
              <span>{names.category}</span>
              <span aria-hidden="true">·</span>
              <ActiveDot active={product.active} />
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setDiscountOpen(true)}>
            Discount…
          </Button>
          <Button variant="secondary" busy={busy} onClick={toggleActive}>
            {product.active ? "Deactivate" : "Activate"}
          </Button>
          <LinkButton variant="primary" href={`/admin/products/${product.id}/edit`}>
            Edit product
          </LinkButton>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Customer pays"
          value={money(product.currentPrice)}
          sub={
            product.discountPercentage > 0
              ? `was ${money(product.basePrice)}`
              : "no offer active"
          }
          tone="brand"
        />
        <StatTile
          // Variant rows, not distinct sizes: a product in four sizes
          // and two colours has eight things the shop counts stock
          // against, and eight is what the inventory screen lists.
          label={summary.colourCount ? "Sellable rows" : "Sizes"}
          value={number(summary.sizeCount)}
          sub={
            summary.sizeCount
              ? summary.colourCount
                ? `${summary.activeSizeCount} on sale · ${summary.colourCount} colour${summary.colourCount === 1 ? "" : "s"}`
                : `${summary.activeSizeCount} on sale`
              : "nothing sellable yet"
          }
          tone={summary.sizeCount ? "neutral" : "amber"}
        />
        <StatTile
          label="Units on hand"
          value={number(summary.totalStock)}
          sub={
            summary.lowestStatus === "out_of_stock"
              ? "a size is out of stock"
              : summary.lowestStatus === "low_stock"
                ? "a size is running low"
                : summary.totalStock
                  ? "every size in stock"
                  : "no stock recorded"
          }
          tone={
            summary.lowestStatus === "out_of_stock"
              ? "red"
              : summary.lowestStatus === "low_stock"
                ? "amber"
                : summary.totalStock
                  ? "green"
                  : "neutral"
          }
        />
        <StatTile
          label="Storefront"
          value={product.active ? "Live" : "Hidden"}
          sub={product.active ? "shoppers can see it" : "in the catalogue only"}
          tone={product.active ? "green" : "amber"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="Photographs"
              description={
                product.images.length
                  ? "The first is the cover shoppers see in the listing."
                  : "What shoppers see this product as."
              }
              actions={
                <LinkButton
                  size="sm"
                  variant="secondary"
                  href={`/admin/products/${product.id}/edit?tab=photos`}
                >
                  Manage
                </LinkButton>
              }
            />
            {product.images.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-500">
                No photographs yet — this product shows an illustrated swatch everywhere it
                appears. Add them from the edit screen.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-3 px-5 py-4">
                {product.images.map((image, index) => (
                  <li key={image.id} className="relative">
                    <GalleryThumbnail
                      src={image.url}
                      alt={image.altText || `${product.name}, photograph ${index + 1}`}
                      className="size-24 rounded-lg ring-1 ring-ink-200"
                    />
                    {index === 0 ? (
                      <span className="absolute top-1 left-1">
                        <Badge tone="gold">Cover</Badge>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title={summary.colourCount ? "Sizes, colours & stock" : "Sizes & stock"}
              description="The rows a shopper actually buys."
              actions={
                <LinkButton
                  size="sm"
                  variant="secondary"
                  href={`/admin/products/${product.id}/edit?tab=sizes`}
                >
                  Manage
                </LinkButton>
              }
            />
            {variants.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-500">
                No sizes recorded, so there is nothing a shopper can add to a bag. Add them from
                the edit screen.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 bg-ink-50/60 text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                      <th className="px-5 py-2.5">Size</th>
                      {/* Only when the product is sold by colour — an
                          empty column on every other product would be
                          noise on the screen that is read most. */}
                      {summary.colourCount ? <th className="px-5 py-2.5">Colour</th> : null}
                      <th className="px-5 py-2.5 text-right">Stock</th>
                      <th className="px-5 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {variants.map((variant) => (
                      <tr key={variant.id}>
                        <td className="px-5 py-2.5 font-semibold text-ink-800">{variant.size}</td>
                        {summary.colourCount ? (
                          <td className="px-5 py-2.5 text-ink-700">
                            {variant.colour ? (
                              <span className="inline-flex items-center gap-1.5">
                                <ColourSwatch hex={variant.colourHex} />
                                {variant.colour}
                              </span>
                            ) : (
                              <span className="text-ink-400">—</span>
                            )}
                          </td>
                        ) : null}
                        <td className="tabular px-5 py-2.5 text-right text-ink-700">
                          {number(variant.stockQuantity)}
                        </td>
                        <td className="px-5 py-2.5">
                          <StockBadge active={variant.active} stock={variant.stockQuantity} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Description" />
            <p className="px-5 py-4 text-sm leading-relaxed whitespace-pre-line text-ink-600">
              {product.description || (
                <span className="text-ink-400">No description recorded.</span>
              )}
            </p>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Attributes" />
            <dl className="divide-y divide-ink-100 px-5 text-sm">
              {Object.keys(product.attributes ?? {}).length === 0 ? (
                <p className="py-4 text-sm text-ink-400">None recorded.</p>
              ) : (
                Object.entries(product.attributes).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-3 py-2.5">
                    <dt className="text-xs font-medium text-ink-500 capitalize">{key}</dt>
                    <dd className="text-sm text-ink-800">{value}</dd>
                  </div>
                ))
              )}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Record" />
            <dl className="divide-y divide-ink-100 px-5 text-sm">
              <Row label="Product ID" value={<span className="font-mono text-[11px]">{product.id}</span>} />
              <Row label="Category" value={names.category} />
              <Row label="Base price" value={money(product.basePrice)} />
              <Row
                label="Discount"
              value={product.discountPercentage > 0 ? `${product.discountPercentage}%` : "None"}
            />
              <Row label="Current price" value={money(product.currentPrice)} />
              <Row label="Featured" value={product.isFeatured ? "Yes" : "No"} />
              <Row label="Created" value={shortDate(product.createdAt)} />
              <Row label="Last updated" value={shortDate(product.updatedAt)} />
            </dl>
          </Card>
        </div>
      </div>

      <DiscountDialog
        open={discountOpen}
        onClose={() => setDiscountOpen(false)}
        products={[product]}
        onDone={load}
      />
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-xs font-medium text-ink-500">{label}</dt>
      <dd className="text-right text-sm text-ink-800">{value}</dd>
    </div>
  );
}
