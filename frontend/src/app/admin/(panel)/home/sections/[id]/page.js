"use client";

/**
 * One home page section (F-06) — making a new one, or editing one.
 *
 * The same screen does both: `/admin/home/sections/new` starts empty,
 * any other id loads that section. Saving sends the whole shelf (the API
 * is a full replace, picked pieces included) and returns to the list,
 * where the order and the on/off switch live.
 *
 * Four things are decided here, top to bottom in the order the shop
 * thinks of them:
 *
 *   - **The words.** A title, an optional line under it, and the link
 *     name the shelf's own "View all" page is reached by. Left blank, the
 *     link name is made from the title — except a title with no English
 *     letters (Tamil only, say), which needs one typed.
 *   - **The look.** One of three layouts, each with its hint; the colour
 *     swatches only appear for Festival / Sale, the one layout that
 *     paints a band. Editorial blows the first picked piece up large,
 *     and the picker below marks which one that is.
 *   - **When.** Start and end are typed in shop time (IST) whatever the
 *     browser's own clock says, and travel as ISO instants. Both blank is
 *     "always on" — the switch is then the only thing deciding.
 *   - **The pieces.** Searched from the catalogue by name, added, put in
 *     order. A picked piece that has since been taken off sale stays on
 *     the list but is skipped on the home page; the list warns about it.
 *
 * Errors the API names per field land under the field they belong to,
 * not in a toast that only says something went wrong somewhere.
 */

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ImageOff,
  LayoutList,
  Plus,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Badge,
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
  Toggle,
  cx,
  useToast,
} from "@/components/admin/ui";
import {
  MAX_PRODUCTS_PER_SECTION,
  MAX_SLUG_LENGTH,
  MAX_SUBTITLE_LENGTH,
  MAX_TITLE_LENGTH,
  PRODUCTS_ON_HOME,
  SLUG_PATTERN,
  createSection,
  getSection,
  isoToShopInput,
  shopInputToIso,
  updateSection,
} from "@/lib/api/homeSections";
import { listAllProducts } from "@/lib/api/products";
import { SHELF_LAYOUTS, SHELF_THEMES } from "@/lib/store/shelfThemes";

const BASE = "/admin/home/sections";
const NEW = "new";

/** How many search matches the picker lists at once. */
const SEARCH_LIMIT = 20;

/** A brand-new section, before anything is typed. */
const BLANK = {
  title: "",
  subtitle: "",
  slug: "",
  startsAt: null,
  endsAt: null,
  active: true,
  layout: "cards",
  theme: SHELF_THEMES[0].id,
  productIds: [],
  products: [],
};

/** A product's thumbnail, if the catalogue has a photograph of it. */
const thumbnailOf = (product) =>
  product?.primaryImage?.url || product?.images?.[0]?.url || null;

export default function HomeSectionEditorPage() {
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();

  const isNew = id === NEW;

  const [state, setState] = useState({
    status: isNew ? "ready" : "loading",
    section: isNew ? BLANK : null,
    error: null,
  });
  const [reload, setReload] = useState(0);

  // The whole catalogue, for searching and for thumbnails. The section's
  // own read carries names and the on-sale flag, but no photographs.
  const [catalogue, setCatalogue] = useState({ status: "loading", products: [] });

  useEffect(() => {
    if (isNew) return undefined;

    const controller = new AbortController();
    let active = true;

    getSection(id, { signal: controller.signal })
      .then((section) => {
        if (active) setState({ status: "ready", section, error: null });
      })
      .catch((error) => {
        if (active && error?.name !== "AbortError") {
          setState((current) => ({
            ...current,
            status: error?.status === 404 ? "missing" : "error",
            error,
          }));
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [id, isNew, reload]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    listAllProducts({ signal: controller.signal })
      .then((products) => {
        if (active) setCatalogue({ status: "ready", products });
      })
      .catch((error) => {
        // Not fatal — the picked list still shows names from the section
        // itself. The picker says so in its own hint.
        if (active && error?.name !== "AbortError") {
          setCatalogue({ status: "error", products: [] });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  /**
   * Saves the whole shelf. Answers with the field errors the API named,
   * if any, so the form can put each under its box; on success it leaves
   * for the list, where the new or changed section can be seen in place.
   */
  async function save(fields) {
    try {
      if (isNew) {
        await createSection(fields);
        toast.success("Section created", "It is at the bottom of the list — move it up to place it.");
      } else {
        await updateSection(id, fields);
        toast.success("Section saved");
      }

      router.push(BASE);
      return {};
    } catch (error) {
      toast.error("Could not save the section", error?.message);
      return error?.fields ?? {};
    }
  }

  // --- render ---------------------------------------------------------------

  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <SkeletonRows rows={5} />
        </Card>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <ErrorNotice error={state.error} onRetry={refresh} />
        <LinkButton href={BASE}>
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to sections
        </LinkButton>
      </div>
    );
  }

  if (state.status === "missing" || !state.section) {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="p-4 sm:p-8">
          <EmptyState
            icon={<LayoutList aria-hidden="true" />}
            title="Section not found"
            description="This section is no longer in the list — it may have been deleted from another screen."
            action={
              <LinkButton href={BASE}>
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                Back to sections
              </LinkButton>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <nav className="flex items-center gap-1.5 text-xs text-ink-500">
        <LinkButton variant="ghost" size="sm" href={BASE}>
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Sections
        </LinkButton>
        <span aria-hidden="true">/</span>
        <span className="min-w-0 truncate font-medium text-ink-700">
          {isNew ? "New section" : state.section.title || "Untitled section"}
        </span>
      </nav>

      {/* Keyed on the id, so the boxes seed themselves from this section
          once, rather than needing an effect to chase a prop. */}
      <SectionForm
        key={state.section.id ?? NEW}
        section={state.section}
        isNew={isNew}
        catalogue={catalogue}
        onSave={save}
      />
    </div>
  );
}

// ============================================================
// THE FORM
// ============================================================

function SectionForm({ section, isNew, catalogue, onSave }) {
  const [form, setForm] = useState(() => ({
    title: section.title ?? "",
    subtitle: section.subtitle ?? "",
    slug: section.slug ?? "",
    startsAt: isoToShopInput(section.startsAt),
    endsAt: isoToShopInput(section.endsAt),
    active: section.active ?? true,
    layout: section.layout || "cards",
    theme: section.theme || SHELF_THEMES[0].id,
    productIds: section.productIds ?? [],
  }));
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  /**
   * What the picker knows about each piece, by id: the catalogue's row
   * (with photographs) where there is one, the section's own read
   * otherwise — a piece can be missing from the catalogue walk if it was
   * truncated, or if the catalogue did not load at all.
   */
  const known = useMemo(() => {
    const map = new Map();

    for (const product of section.products ?? []) {
      map.set(product.id, { ...product, image: null });
    }

    for (const product of catalogue.products) {
      map.set(product.id, {
        id: product.id,
        name: product.name,
        slug: product.slug,
        active: product.active,
        price: product.currentPrice,
        image: thumbnailOf(product),
      });
    }

    return map;
  }, [section.products, catalogue.products]);

  /** Client-side checks for what the API would refuse anyway, said sooner. */
  function check() {
    const errors = {};
    const title = form.title.trim();
    const slug = form.slug.trim().toLowerCase();

    if (!title) errors.title = "Give the section a title";
    else if (title.length > MAX_TITLE_LENGTH) {
      errors.title = `A title must not exceed ${MAX_TITLE_LENGTH} characters`;
    }

    if (form.subtitle.trim().length > MAX_SUBTITLE_LENGTH) {
      errors.subtitle = `The line under the title must not exceed ${MAX_SUBTITLE_LENGTH} characters`;
    }

    if (slug && slug.length > MAX_SLUG_LENGTH) {
      errors.slug = `The link name must not exceed ${MAX_SLUG_LENGTH} characters`;
    } else if (slug && !SLUG_PATTERN.test(slug)) {
      errors.slug =
        "Use lower-case letters, numbers and single hyphens only, e.g. diwali-sale-2026";
    }

    const startsAt = shopInputToIso(form.startsAt);
    const endsAt = shopInputToIso(form.endsAt);

    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      errors.endsAt = "The end must be after the start";
    }

    if (form.productIds.length > MAX_PRODUCTS_PER_SECTION) {
      errors.productIds = `A section holds at most ${MAX_PRODUCTS_PER_SECTION} pieces`;
    }

    return errors;
  }

  async function submit(event) {
    event.preventDefault();

    const errors = check();

    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    setFieldErrors({});

    try {
      const refused = await onSave({
        ...form,
        startsAt: shopInputToIso(form.startsAt),
        endsAt: shopInputToIso(form.endsAt),
      });

      setFieldErrors(refused);
    } finally {
      setSaving(false);
    }
  }

  const layout = SHELF_LAYOUTS.find((option) => option.id === form.layout);

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {/* ----------------------------------------------------------
          THE WORDS
          ---------------------------------------------------------- */}

      <Card>
        <CardHeader
          title={isNew ? "New section" : "Edit section"}
          description="What is printed over the row of products on the home page."
        />

        <div className="space-y-4 p-4">
          <Field
            label="Title"
            required
            error={fieldErrors.title}
            hint={`Short — it is a heading, not a sentence. Up to ${MAX_TITLE_LENGTH} characters.`}
          >
            <Input
              value={form.title}
              invalid={Boolean(fieldErrors.title)}
              maxLength={MAX_TITLE_LENGTH}
              placeholder="Diwali Sale"
              onChange={(e) => set("title")(e.target.value)}
            />
          </Field>

          <Field
            label="Line under the title"
            error={fieldErrors.subtitle}
            hint="Optional. One line on what the section is — an offer, an occasion."
          >
            <Textarea
              rows={2}
              value={form.subtitle}
              invalid={Boolean(fieldErrors.subtitle)}
              maxLength={MAX_SUBTITLE_LENGTH}
              placeholder="Festive salwars, up to 30% off until the 2nd"
              onChange={(e) => set("subtitle")(e.target.value)}
            />
          </Field>

          <Field
            label="Link name"
            error={fieldErrors.slug}
            hint="Optional. The end of the section's own page address. Left blank, it is made from the title — but a title with no English letters (Tamil only, for example) needs one typed here, like diwali-sale."
          >
            <Input
              value={form.slug}
              invalid={Boolean(fieldErrors.slug)}
              maxLength={MAX_SLUG_LENGTH}
              placeholder="diwali-sale-2026"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => set("slug")(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      {/* ----------------------------------------------------------
          THE LOOK
          ---------------------------------------------------------- */}

      <Card>
        <CardHeader
          title="How it looks"
          description="The same three layouts the home page draws."
        />

        <div className="space-y-4 p-4">
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-ink-700">Layout</legend>

            <div className="grid gap-2 sm:grid-cols-3">
              {SHELF_LAYOUTS.map((option) => {
                const chosen = form.layout === option.id;

                return (
                  <label
                    key={option.id}
                    className={cx(
                      "relative flex cursor-pointer flex-col gap-1 rounded-lg p-3 ring-1 ring-inset transition-colors",
                      "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600",
                      chosen ? "bg-brand-50 ring-2 ring-brand-600" : "bg-white ring-ink-300 hover:bg-ink-50",
                    )}
                  >
                    <input
                      type="radio"
                      name="layout"
                      value={option.id}
                      checked={chosen}
                      onChange={() => set("layout")(option.id)}
                      className="sr-only"
                    />
                    <span className="flex items-center justify-between gap-2 text-sm font-semibold text-ink-900">
                      {option.label}
                      {chosen ? <Check className="size-4 text-brand-600" aria-hidden="true" /> : null}
                    </span>
                    <span className="text-xs leading-relaxed text-ink-500">{option.hint}</span>
                  </label>
                );
              })}
            </div>

            {fieldErrors.layout ? (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.layout}</p>
            ) : null}

            {layout?.id === "editorial" ? (
              <p className="mt-2 text-xs text-ink-600">
                The <strong>first</strong> piece in the list below is the big picture;
                the rest slide beside it. Move the one with the best photograph to
                the top.
              </p>
            ) : null}
          </fieldset>

          {/* Only the festival band is painted, so only it has colours. The
              theme is still sent for the others — the API keeps it, and
              switching back to Festival finds the one chosen before. */}
          {form.layout === "festival" ? (
            <fieldset className="border-t border-ink-200/80 pt-4">
              <legend className="mb-1.5 text-xs font-semibold text-ink-700">Colours</legend>

              <div className="flex flex-wrap gap-2">
                {SHELF_THEMES.map((theme) => {
                  const chosen = form.theme === theme.id;

                  return (
                    <label
                      key={theme.id}
                      title={theme.label}
                      className={cx(
                        "flex cursor-pointer items-center gap-2 rounded-lg p-1.5 pr-3 ring-1 ring-inset",
                        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600",
                        chosen ? "ring-2 ring-brand-600" : "ring-ink-300 hover:bg-ink-50",
                      )}
                    >
                      <input
                        type="radio"
                        name="theme"
                        value={theme.id}
                        checked={chosen}
                        onChange={() => set("theme")(theme.id)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className="grid size-8 place-items-center rounded-md"
                        style={{ backgroundColor: theme.bg }}
                      >
                        <span
                          className="size-3.5 rounded-full"
                          style={{ backgroundColor: theme.accent }}
                        />
                      </span>
                      <span className="text-xs font-medium text-ink-700">{theme.label}</span>
                    </label>
                  );
                })}
              </div>

              {fieldErrors.theme ? (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.theme}</p>
              ) : (
                <p className="mt-1 text-xs text-ink-500">
                  The band&rsquo;s background and the colour of its title, prices and
                  frames.
                </p>
              )}
            </fieldset>
          ) : null}
        </div>
      </Card>

      {/* ----------------------------------------------------------
          WHEN
          ---------------------------------------------------------- */}

      <Card>
        <CardHeader
          title="When it shows"
          description="Times are India time (IST). Leave both blank for a section that is always on."
        />

        <div className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField
              label="Starts"
              value={form.startsAt}
              error={fieldErrors.startsAt}
              hint="Blank: from as soon as it is saved."
              onChange={set("startsAt")}
            />
            <DateField
              label="Ends"
              value={form.endsAt}
              error={fieldErrors.endsAt}
              hint="Blank: until it is switched off. A festival layout counts down to this."
              onChange={set("endsAt")}
            />
          </div>

          <div className="flex items-start justify-between gap-4 border-t border-ink-200/80 pt-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-800">
                {form.active ? "Switched on" : "Switched off"}
              </p>
              <p className="mt-1 text-xs text-ink-500">
                {form.active
                  ? "Shows on the home page while inside the dates above."
                  : "Kept, with its pieces, but not shown — whatever the dates say."}
              </p>
              {fieldErrors.active ? (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.active}</p>
              ) : null}
            </div>

            <Toggle
              checked={form.active}
              onChange={set("active")}
              label="Show this section on the home page"
            />
          </div>
        </div>
      </Card>

      {/* ----------------------------------------------------------
          THE PIECES
          ---------------------------------------------------------- */}

      <ProductPicker
        ids={form.productIds}
        known={known}
        catalogue={catalogue}
        layout={form.layout}
        error={fieldErrors.productIds}
        onChange={set("productIds")}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" busy={saving}>
          {isNew ? "Create section" : "Save section"}
        </Button>
        <LinkButton variant="ghost" href={BASE}>
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}

/** A datetime-local box, read as shop time, with a way to empty it. */
function DateField({ label, value, error, hint, onChange }) {
  return (
    <Field label={`${label} (IST)`} error={error} hint={hint}>
      <div className="flex gap-2">
        <Input
          type="datetime-local"
          value={value}
          invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value)}
        />
        {value ? (
          <Button
            variant="ghost"
            className="shrink-0"
            aria-label={`Clear the ${label.toLowerCase()} date`}
            onClick={(e) => {
              // Inside a <label>: without this the click also focuses the box.
              e.preventDefault();
              onChange("");
            }}
          >
            <X className="size-3.5" aria-hidden="true" />
            Clear
          </Button>
        ) : null}
      </div>
    </Field>
  );
}

// ============================================================
// THE PIECES
// ============================================================

/**
 * Search the catalogue, add, order, remove.
 *
 * The picked list is the order the shelf shows them in. Only the first
 * PRODUCTS_ON_HOME are on the home page itself; the rest are on the
 * section's own page behind "View all", and the list draws the line.
 */
function ProductPicker({ ids, known, catalogue, layout, error, onChange }) {
  const [search, setSearch] = useState("");

  const full = ids.length >= MAX_PRODUCTS_PER_SECTION;

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];

    const picked = new Set(ids);

    return catalogue.products
      .filter(
        (product) =>
          !picked.has(product.id) &&
          `${product.name} ${product.slug ?? ""}`.toLowerCase().includes(term),
      )
      .slice(0, SEARCH_LIMIT);
  }, [catalogue.products, ids, search]);

  const offSale = ids.filter((id) => known.get(id)?.active === false).length;

  function add(id) {
    if (full || ids.includes(id)) return;
    onChange([...ids, id]);
  }

  function remove(id) {
    onChange(ids.filter((row) => row !== id));
  }

  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;

    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <Card>
      <CardHeader
        title="Products in this section"
        description={`In the order they are shown. The home page shows the first ${PRODUCTS_ON_HOME}; the rest are behind “View all”.`}
        actions={
          <Badge tone={full ? "amber" : "neutral"}>
            {ids.length} / {MAX_PRODUCTS_PER_SECTION}
          </Badge>
        }
      />

      <div className="space-y-4 p-4">
        {/* --- search --- */}
        <div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-ink-700">
              Add a product
            </span>
            <span className="relative block">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-400"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={search}
                disabled={catalogue.status !== "ready" || full}
                className="pl-8"
                placeholder={
                  full
                    ? `This section is full — ${MAX_PRODUCTS_PER_SECTION} is the most it holds`
                    : "Search products by name"
                }
                onChange={(e) => setSearch(e.target.value)}
              />
            </span>
          </label>

          <p className="mt-1 text-xs text-ink-500">
            {catalogue.status === "loading"
              ? "Loading the catalogue…"
              : catalogue.status === "error"
                ? "The catalogue could not be loaded — reload the page to add products. Those already picked are kept."
                : "Type part of a name. Products already in the section are not listed."}
          </p>

          {search.trim() && catalogue.status === "ready" ? (
            matches.length ? (
              <ul className="mt-2 max-h-72 divide-y divide-ink-200/80 overflow-y-auto rounded-lg ring-1 ring-ink-200">
                {matches.map((product) => (
                  <li key={product.id} className="flex items-center gap-3 px-3 py-2">
                    <Thumb src={thumbnailOf(product)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink-800">{product.name}</span>
                      {product.active ? null : (
                        <span className="text-[11px] text-amber-700">Off sale</span>
                      )}
                    </span>
                    <Button
                      size="sm"
                      disabled={full}
                      aria-label={`Add ${product.name}`}
                      onClick={() => add(product.id)}
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-ink-500">No products match &ldquo;{search.trim()}&rdquo;.</p>
            )
          ) : null}
        </div>

        {error ? <p className="text-xs text-red-600">{error}</p> : null}

        {offSale ? (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {offSale === 1 ? "One picked product is" : `${offSale} picked products are`} off
              sale, so the home page skips {offSale === 1 ? "it" : "them"}. Put{" "}
              {offSale === 1 ? "it" : "them"} back on sale, or remove{" "}
              {offSale === 1 ? "it" : "them"} here.
            </span>
          </p>
        ) : null}

        {/* --- the picked list --- */}
        {ids.length === 0 ? (
          <p className="rounded-lg bg-ink-50 p-3 text-xs text-ink-500 ring-1 ring-inset ring-ink-200">
            No products yet. A section can be saved empty and filled later, but the
            home page does not show an empty section.
          </p>
        ) : (
          <ol className="divide-y divide-ink-200/80 rounded-lg ring-1 ring-ink-200">
            {ids.map((id, index) => {
              const product = known.get(id);
              const name = product?.name || "A product no longer in the catalogue";

              return (
                <li key={id}>
                  {index === PRODUCTS_ON_HOME ? (
                    <p className="bg-ink-50 px-3 py-1 text-[11px] text-ink-500">
                      Below here: only on the section&rsquo;s own page, behind
                      &ldquo;View all&rdquo;.
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <span className="w-5 shrink-0 text-xs tabular-nums text-ink-400">
                      {index + 1}
                    </span>
                    <Thumb src={product?.image} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm text-ink-800">{name}</span>
                        {layout === "editorial" && index === 0 ? (
                          <Badge tone="brand">Big picture</Badge>
                        ) : null}
                      </span>
                      {product?.active === false ? (
                        <span className="flex items-center gap-1 text-[11px] text-amber-700">
                          <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
                          Off sale — skipped on the home page
                        </span>
                      ) : null}
                    </span>

                    <span className="flex shrink-0 items-center gap-0.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-9 px-0 sm:size-8"
                        disabled={index === 0}
                        aria-label={`Move ${name} up`}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="size-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-9 px-0 sm:size-8"
                        disabled={index === ids.length - 1}
                        aria-label={`Move ${name} down`}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="size-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 px-1.5 text-red-700 sm:h-8"
                        aria-label={`Remove ${name}`}
                        onClick={() => remove(id)}
                      >
                        <X className="size-3.5" aria-hidden="true" />
                        Remove
                      </Button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Card>
  );
}

/** A small square photograph, or a placeholder where there is none. */
function Thumb({ src }) {
  if (!src) {
    return (
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-ink-100 text-ink-400">
        <ImageOff className="size-4" aria-hidden="true" />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- same reasoning as MediaFrame
    <img
      src={src}
      alt=""
      loading="lazy"
      className="size-10 shrink-0 rounded-md bg-ink-100 object-cover"
    />
  );
}
