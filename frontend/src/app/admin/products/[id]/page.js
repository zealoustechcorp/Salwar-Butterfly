"use client";

import { ArrowLeft } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { DiscountDialog } from "@/components/admin/DiscountDialog";
import { ActiveDot, PriceCell, StatTile, StockPill } from "@/components/admin/ProductBits";
import { ColourSwatch, ImageTile, ProductThumb } from "@/components/admin/ProductThumb";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  cx,
  ErrorNotice,
  LinkButton,
  RequirementTag,
  SkeletonRows,
  useToast,
} from "@/components/admin/ui";
import { getProduct, setActive } from "@/lib/api/products";
import { FIT_LABEL, money, number, shortDate } from "@/lib/format";

export default function ProductDetailPage() {
  const params = useParams();
  const id = params?.id;
  const toast = useToast();

  const [reload, setReload] = useState(0);
  const [result, setResult] = useState({ product: null, error: null });
  const [busy, setBusy] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);

  // Every setState here lands after an await, so the effect never triggers a
  // cascading render on mount.
  useEffect(() => {
    let active = true;
    getProduct(id)
      .then((fetched) => {
        if (active) setResult({ product: fetched, error: null });
      })
      .catch((err) => {
        if (active) setResult((current) => ({ ...current, error: err }));
      });
    return () => {
      active = false;
    };
  }, [id, reload]);

  const load = useCallback(() => setReload((n) => n + 1), []);
  const { product, error } = result;

  async function toggleActive() {
    setBusy(true);
    try {
      const outcome = await setActive({ productIds: [product.id], active: !product.is_active });
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

  const gallery = product.images.filter((i) => i.variant_id === null);
  const variantImages = product.images.filter((i) => i.variant_id !== null);
  const colours = [...new Map(product.variants.map((v) => [v.colour, v])).values()];

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
          <ProductThumb
            hex={product.primary_image?.swatch_hex || product.variants[0]?.colour_hex}
            seed={product.primary_image?.swatch_seed ?? product.id}
            size={64}
            rounded="rounded-xl"
            label={product.name}
          />
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight text-ink-900">
              {product.name}
              {product.is_featured ? <Badge tone="gold">Featured</Badge> : null}
              {product.discount_percent > 0 ? (
                <Badge tone="brand">−{product.discount_percent}% offer</Badge>
              ) : null}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <span className="font-mono">/{product.slug}</span>
              <span aria-hidden="true">·</span>
              <span>{product.category_name}</span>
              <span aria-hidden="true">·</span>
              <span>{FIT_LABEL[product.fit] || "No fit"}</span>
              <span aria-hidden="true">·</span>
              <ActiveDot active={product.is_active} />
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setDiscountOpen(true)}>
            Discount…
          </Button>
          <Button variant="secondary" busy={busy} onClick={toggleActive}>
            {product.is_active ? "Deactivate" : "Activate"}
          </Button>
          <LinkButton variant="primary" href={`/admin/products/${product.id}/edit`}>
            Edit product
          </LinkButton>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Customer pays"
          value={money(product.sale_price)}
          sub={product.discount_percent > 0 ? `was ${money(product.base_price)}` : "no offer active"}
          tone="brand"
          requirement="F-03.08"
        />
        <StatTile
          label="Variants"
          value={number(product.stock.variant_count)}
          sub={`${product.stock.active_variant_count} active · ${colours.length} colours`}
          requirement="F-03.03"
        />
        <StatTile
          label="Units on hand"
          value={number(product.stock.total_stock)}
          sub={product.stock.has_in_stock ? "at least one variant sellable" : "nothing sellable"}
          tone={product.stock.has_in_stock ? "green" : "red"}
          requirement="F-04.01"
        />
        <StatTile
          label="Ordered to date"
          value={number(product.ordered_units)}
          sub={product.ordered_units ? "protected from deletion" : "never sold — deletable"}
          requirement="F-03.11"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="Variants"
              requirement="F-03.10"
              description="The sellable rows. Effective price honours variant overrides before falling back to the product."
              actions={
                <LinkButton size="sm" variant="secondary" href={`/admin/products/${product.id}/edit?tab=variants`}>
                  Manage
                </LinkButton>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50/60 text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                    <th className="px-4 py-2.5">SKU</th>
                    <th className="px-4 py-2.5">Size</th>
                    <th className="px-4 py-2.5">Colour</th>
                    <th className="px-4 py-2.5 text-right">Price</th>
                    <th className="px-4 py-2.5 text-right">Stock</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {product.variants.map((variant) => (
                    <tr key={variant.id} className={cx(!variant.is_active && "bg-ink-50/60 text-ink-400")}>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-ink-600">{variant.sku}</td>
                      <td className="px-4 py-2.5 font-medium text-ink-800">{variant.size}</td>
                      <td className="px-4 py-2.5">
                        <ColourSwatch hex={variant.colour_hex} name={variant.colour} />
                      </td>
                      <td className="px-4 py-2.5">
                        <PriceCell
                          basePrice={variant.pricing.unit_price}
                          salePrice={variant.pricing.sale_price}
                          discountPercent={variant.pricing.discount_percent}
                          overridden={variant.pricing.has_override}
                        />
                      </td>
                      <td className="tabular px-4 py-2.5 text-right font-medium">
                        {variant.stock_quantity}
                      </td>
                      <td className="px-4 py-2.5">
                        <StockPill status={variant.stock_status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Images"
              requirement="F-03.06"
              description={`${gallery.length} gallery · ${variantImages.length} variant-specific`}
              actions={
                <LinkButton size="sm" variant="secondary" href={`/admin/products/${product.id}/edit?tab=images`}>
                  Manage
                </LinkButton>
              }
            />
            <div className="space-y-4 p-5">
              <div>
                <p className="mb-2 text-xs font-semibold text-ink-700">Product gallery</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {gallery.map((image) => (
                    <ImageTile key={image.id} image={image} variantLabel="Gallery" size={120} />
                  ))}
                </div>
              </div>
              {variantImages.length ? (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-700">
                    Variant-specific
                    <RequirementTag id="F-03.04" />
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {variantImages.map((image) => {
                      const variant = product.variants.find((v) => v.id === image.variant_id);
                      return (
                        <ImageTile
                          key={image.id}
                          image={image}
                          size={120}
                          variantLabel={variant ? `${variant.size} · ${variant.colour}` : "Variant"}
                        />
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Description" />
            <p className="px-5 py-4 text-sm leading-relaxed text-ink-600">
              {product.description || <span className="text-ink-400">No description recorded.</span>}
            </p>
          </Card>

          <Card>
            <CardHeader title="Attributes" requirement="F-03.09" />
            <dl className="divide-y divide-ink-100 px-5 text-sm">
              {Object.entries(product.attributes || {}).length === 0 ? (
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
              <Row label="Product ID" value={<span className="font-mono text-xs">{product.id}</span>} />
              <Row label="Category" value={product.category_name} />
              <Row label="Size chart" value={product.size_chart_name || "—"} />
              <Row label="Base price" value={money(product.base_price)} />
              <Row
                label="Discount"
                value={product.discount_percent > 0 ? `${product.discount_percent}%` : "None"}
              />
              <Row label="Published" value={shortDate(product.published_at)} />
              <Row label="Created" value={shortDate(product.created_at)} />
              <Row label="Last updated" value={shortDate(product.updated_at)} />
            </dl>
          </Card>
        </div>
      </div>

      <DiscountDialog
        open={discountOpen}
        onClose={() => setDiscountOpen(false)}
        targets={{ products: [product], variants: [] }}
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
