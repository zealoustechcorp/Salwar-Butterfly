"use client";

/**
 * One home page section (F-06): Best sellers, or the custom section.
 *
 * Three things change here and nothing else — the section's name, its
 * description, and its pieces. The pieces are a checklist of the whole
 * catalogue: tick a product to add it, untick to take it out. Ticked pieces
 * show on the home page in the order they were ticked. A section with
 * nothing ticked is not shown on the home page.
 *
 * The same ticks can be made from a product's own page; both write the
 * same list.
 */

import { ArrowLeft, ImageOff, LayoutList, Search, TriangleAlert } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  Field,
  Input,
  LinkButton,
  SkeletonRows,
  Textarea,
  cx,
  useToast,
} from "@/components/admin/ui";
import {
  MAX_PRODUCTS_PER_SECTION,
  MAX_SUBTITLE_LENGTH,
  MAX_TITLE_LENGTH,
  SECTION_HINTS,
  SECTION_KEYS,
  getSection,
  updateSection,
} from "@/lib/api/homeSections";
import { listAllProducts } from "@/lib/api/products";

// Where "back" goes: the Home page group's first screen. There is no list
// of sections any more, only this one.
const BASE = "/admin/home";

const thumbnailOf = (product) => product?.primaryImage?.url || product?.images?.[0]?.url || null;

export default function HomeSectionEditorPage() {
  // The folder is [id], but the value is a section key: best-sellers or custom.
  const { id: key } = useParams();
  const known = SECTION_KEYS.includes(key);

  const [state, setState] = useState({ status: known ? "loading" : "missing", section: null, error: null });
  const [catalogue, setCatalogue] = useState({ status: "loading", products: [], error: null });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!known) return undefined;

    const controller = new AbortController();
    let active = true;

    getSection(key, { signal: controller.signal })
      .then((section) => active && setState({ status: "ready", section, error: null }))
      .catch((error) => {
        if (active && error?.name !== "AbortError") {
          setState({ status: error?.status === 404 ? "missing" : "error", section: null, error });
        }
      });

    listAllProducts({ signal: controller.signal })
      .then((products) => active && setCatalogue({ status: "ready", products, error: null }))
      .catch((error) => {
        if (active && error?.name !== "AbortError") setCatalogue({ status: "error", products: [], error });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [key, known, reload]);

  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <SkeletonRows rows={6} />
        </Card>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <ErrorNotice error={state.error} onRetry={() => setReload((n) => n + 1)} />
        <BackLink />
      </div>
    );
  }

  if (state.status === "missing") {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="p-4 sm:p-8">
          <EmptyState
            icon={<LayoutList aria-hidden="true" />}
            title="Section not found"
            description="The home page has one section you pick products for: the custom section."
            action={<BackLink />}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-lg font-semibold text-ink-900">Custom section</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          The one section on the home page you pick yourself. It shows as a row of product cards. Currently called <strong className="font-semibold text-ink-700">{state.section.title}</strong>.
        </p>
      </header>

      <SectionForm key={state.section.updatedAt ?? key} section={state.section} catalogue={catalogue} />
    </div>
  );
}

// To the one section that exists. BASE (/admin/home) only redirects to
// the carousel, which is not where someone looking for a section meant
// to go.
function BackLink() {
  return (
    <LinkButton variant="ghost" size="sm" href={`${BASE}/sections/custom`}>
      <ArrowLeft className="size-3.5" aria-hidden="true" />
      Custom section
    </LinkButton>
  );
}

function SectionForm({ section, catalogue }) {
  const toast = useToast();

  const [title, setTitle] = useState(section.title);
  const [subtitle, setSubtitle] = useState(section.subtitle);
  const [picked, setPicked] = useState(section.productIds);
  const [search, setSearch] = useState("");
  const [onlyTicked, setOnlyTicked] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const tickedSet = useMemo(() => new Set(picked), [picked]);
  const full = picked.length >= MAX_PRODUCTS_PER_SECTION;

  // Every catalogue product, plus any picked one the catalogue no longer
  // lists (deleted since), so it can still be unticked.
  const rows = useMemo(() => {
    const list = catalogue.products.map((product) => ({
      id: product.id,
      name: product.name,
      active: product.active,
      image: thumbnailOf(product),
    }));
    const listed = new Set(list.map((product) => product.id));
    for (const product of section.products) {
      if (!listed.has(product.id)) list.push({ ...product, image: null });
    }

    const needle = search.trim().toLowerCase();
    return list.filter(
      (product) =>
        (!onlyTicked || tickedSet.has(product.id)) &&
        (!needle || product.name.toLowerCase().includes(needle)),
    );
  }, [catalogue.products, section.products, search, onlyTicked, tickedSet]);

  const toggle = (id) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : full ? current : [...current, id],
    );

  async function save(event) {
    event.preventDefault();

    const local = {};
    if (!title.trim()) local.title = "Give the section a name";
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }

    setSaving(true);
    try {
      await updateSection(section.key, { title, subtitle, productIds: picked });
      toast.success(
        "Section saved",
        picked.length
          ? "The home page shows it within about a minute."
          : "It has no products, so it is hidden from the home page.",
      );
      // Stay on the page: it is the only one, so there is nowhere to go back
      // to, and the form already holds what was just saved.
      setErrors({});
      setSaving(false);
    } catch (error) {
      setErrors(error?.fields ?? {});
      toast.error("Could not save the section", error?.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Card>
        <CardHeader title="Name and description" description={SECTION_HINTS[section.key]} />
        <div className="space-y-4 p-4">
          <Field label="Name" required error={errors.title} hint="The heading shoppers see on the home page.">
            <Input
              id="section-title"
              value={title}
              maxLength={MAX_TITLE_LENGTH}
              invalid={Boolean(errors.title)}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field
            label="Description"
            error={errors.subtitle}
            hint={`Optional. One line under the name, e.g. "Up to 30% off till 3 Nov". ${subtitle.length}/${MAX_SUBTITLE_LENGTH}`}
          >
            <Textarea
              id="section-subtitle"
              rows={2}
              value={subtitle}
              maxLength={MAX_SUBTITLE_LENGTH}
              invalid={Boolean(errors.subtitle)}
              onChange={(event) => setSubtitle(event.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Products"
          description={`Tick the products to show in this section. ${picked.length} / ${MAX_PRODUCTS_PER_SECTION} ticked.`}
        />
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
              <Input
                id="section-search"
                type="search"
                placeholder="Search products by name"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-700">
              <input
                id="section-only-ticked"
                type="checkbox"
                checked={onlyTicked}
                onChange={(event) => setOnlyTicked(event.target.checked)}
                className="size-4 accent-brand-600"
              />
              Show ticked only
            </label>
          </div>

          {errors.productIds ? <p className="text-xs text-red-600">{errors.productIds}</p> : null}
          {full ? (
            <p className="text-xs text-amber-700">
              This section is full. Untick a product before ticking another.
            </p>
          ) : null}

          {catalogue.status === "loading" ? (
            <SkeletonRows rows={6} />
          ) : catalogue.status === "error" ? (
            <ErrorNotice error={catalogue.error} />
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-500">
              {onlyTicked ? "Nothing is ticked yet." : "No products match that search."}
            </p>
          ) : (
            <ul className="max-h-[32rem] divide-y divide-ink-100 overflow-y-auto rounded-lg ring-1 ring-ink-200">
              {rows.map((product) => {
                const ticked = tickedSet.has(product.id);
                const disabled = !ticked && full;

                return (
                  <li key={product.id}>
                    <label
                      className={cx(
                        "flex items-center gap-3 px-3 py-2.5 transition-colors",
                        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-ink-50",
                        ticked && "bg-brand-50/60",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={ticked}
                        disabled={disabled}
                        onChange={() => toggle(product.id)}
                        className="size-4 shrink-0 accent-brand-600"
                      />
                      <Thumb src={product.image} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink-800">{product.name}</span>
                        {product.active === false ? (
                          <span className="flex items-center gap-1 text-[11px] text-amber-700">
                            <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
                            Off sale, so not shown on the home page
                          </span>
                        ) : null}
                      </span>
                      {ticked ? (
                        <span className="shrink-0 text-xs font-semibold text-brand-700 tabular-nums">
                          #{picked.indexOf(product.id) + 1}
                        </span>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-ink-500">
            Ticked products show on the home page in the order you ticked them (the # number).
          </p>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving…" : "Save section"}
        </Button>
      </div>
    </form>
  );
}

function Thumb({ src }) {
  if (!src) {
    return (
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-ink-100 text-ink-400">
        <ImageOff className="size-4" aria-hidden="true" />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 40px admin thumbnail
    <img src={src} alt="" className="size-10 shrink-0 rounded-md object-cover" />
  );
}
