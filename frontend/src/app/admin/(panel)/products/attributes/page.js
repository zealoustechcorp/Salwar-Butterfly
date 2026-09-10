"use client";

import { ArrowLeft, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  Badge,
  Button,
  Card,
  CardHeader,
  cx,
  ErrorNotice,
  Input,
  LinkButton,
  SkeletonRows,
  Toggle,
  useToast,
} from "@/components/admin/ui";
import {
  ATTRIBUTE_GROUPS,
  COLOUR_FALLBACK_HEX,
  COLOUR_GROUP,
  createAttributeValue,
  deleteAttributeValue,
  listAttributeValues,
  setAttributeValueActive,
  updateAttributeValue,
} from "@/lib/api/attributes";

/**
 * The approved-values register.
 *
 * Curating the vocabulary here is what turns the product form's
 * attribute fields into dropdowns instead of free text — the reason
 * "Cotton", "cotton " and "Coton" do not all end up in the catalogue.
 *
 * Three actions, and the difference between them matters:
 *   rename  — rewrites the value on every product using it
 *   retire  — hides it from new products, leaves existing ones alone
 *   delete  — permanent, and refused while any product still uses it
 */
export default function AttributesPage() {
  const toast = useToast();

  const [reload, setReload] = useState(0);
  const [state, setState] = useState({ groups: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    listAttributeValues({ signal: controller.signal })
      .then((groups) => {
        if (active) setState({ groups, error: null });
      })
      .catch((err) => {
        if (active && err?.name !== "AbortError")
          setState((current) => ({ ...current, error: err }));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reload]);

  const load = useCallback(() => setReload((n) => n + 1), []);
  const { groups, error } = state;

  if (error && !groups)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <ErrorNotice error={error} onRetry={load} />
        <LinkButton href="/admin/products">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to products
        </LinkButton>
      </div>
    );

  if (!groups) return <SkeletonRows rows={10} className="mx-auto max-w-4xl" />;

  // Groups the API knows about but this build does not render yet — shown
  // so a value can never become invisible and unmanageable. Colour is
  // excluded because it gets its own panel below: it is rendered here
  // but is deliberately not one of ATTRIBUTE_GROUPS, since it belongs to
  // the variant rather than the product.
  const extraGroups = Object.keys(groups).filter(
    (key) =>
      key !== COLOUR_GROUP.key &&
      !ATTRIBUTE_GROUPS.some((group) => group.key === key),
  );

  const total = Object.values(groups).reduce((sum, list) => sum + list.length, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">
            Approved attributes
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            The values the product form offers. {total} recorded across{" "}
            {Object.keys(groups).length || ATTRIBUTE_GROUPS.length} groups — add one here and it
            appears in the matching dropdown on every product screen.
          </p>
        </div>
        <LinkButton variant="ghost" href="/admin/products">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to products
        </LinkButton>
      </div>

      {/* Colour first, and with swatches: it is the only group carried by
          the sellable row rather than the product, and the only one a
          shop picks by eye. */}
      <GroupPanel
        group={COLOUR_GROUP}
        values={groups[COLOUR_GROUP.key] ?? []}
        withSwatch
        onDone={load}
      />

      {ATTRIBUTE_GROUPS.map((group) => (
        <GroupPanel
          key={group.key}
          group={group}
          values={groups[group.key] ?? []}
          onDone={load}
        />
      ))}

      {extraGroups.map((key) => (
        <GroupPanel
          key={key}
          group={{
            key,
            label: key,
            description: "Recorded on products but not offered by the form yet.",
            placeholder: "New value",
          }}
          values={groups[key] ?? []}
          onDone={load}
        />
      ))}
    </div>
  );
}

/**
 * @param {boolean} [props.withSwatch]  render and edit a hex alongside
 *        each value. Only colour uses it; every other group leaves the
 *        column null and would show an empty picker for no reason.
 */
function GroupPanel({ group, values, withSwatch = false, onDone }) {
  const toast = useToast();

  const [draft, setDraft] = useState("");
  const [hexDraft, setHexDraft] = useState("#7B1E3A");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");

  const inUse = values.filter((value) => value.usageCount > 0).length;
  const retired = values.filter((value) => !value.active).length;

  async function add() {
    const value = draft.trim();
    if (!value) return;

    setAdding(true);
    try {
      await createAttributeValue(group.key, value, {
        ...(withSwatch ? { hex: hexDraft } : {}),
      });
      toast.success(`"${value}" added to ${group.label.toLowerCase()}.`);
      setDraft("");
      await onDone();
    } catch (err) {
      toast.error(err.message || "Could not add the value.");
    } finally {
      setAdding(false);
    }
  }

  /** Re-tones a colour. Every row carrying it restyles on the next read. */
  async function saveHex(value, hex) {
    if (hex === value.hex) return;

    setBusyId(value.id);
    try {
      await updateAttributeValue(value.id, { hex });
      await onDone();
    } catch (err) {
      toast.error(err.message || "Could not change the swatch.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(value) {
    setBusyId(value.id);
    try {
      await setAttributeValueActive(value.id, !value.active);
      toast.success(
        value.active
          ? `"${value.value}" retired — existing products keep it.`
          : `"${value.value}" is offered again.`,
      );
      await onDone();
    } catch (err) {
      toast.error(err.message || "Could not change the value.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveRename(value) {
    const next = editValue.trim();

    if (!next || next === value.value) {
      setEditingId(null);
      return;
    }

    setBusyId(value.id);
    try {
      const result = await updateAttributeValue(value.id, { value: next });
      toast.success(
        `Renamed to "${result.value.value}".`,
        // Products, for a group carried by the product; variant rows for
        // colour, which a product carries once per size it sells the
        // colourway in. "Rows" is honest on both paths.
        result.productsUpdated
          ? `${result.productsUpdated} row${result.productsUpdated === 1 ? "" : "s"} updated too.`
          : undefined,
      );
      setEditingId(null);
      await onDone();
    } catch (err) {
      toast.error(err.message || "Could not rename the value.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(value) {
    setBusyId(value.id);
    try {
      await deleteAttributeValue(value.id);
      toast.success(`"${value.value}" deleted.`);
      await onDone();
    } catch (err) {
      // The API refuses while the value is still in use, and says by how
      // many — pass that through rather than a generic failure.
      toast.error(err.message || "Could not delete the value.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title={<span className="capitalize">{group.label}</span>}
        description={group.description}
        actions={
          <span className="flex items-center gap-1.5">
            <Badge tone="neutral">{values.length}</Badge>
            {retired ? <Badge tone="slate">{retired} retired</Badge> : null}
          </span>
        }
      />

      <div className="border-b border-ink-200/80 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {withSwatch ? (
            <input
              type="color"
              value={hexDraft}
              onChange={(e) => setHexDraft(e.target.value)}
              aria-label="Swatch for the new colour"
              className="size-9 shrink-0 cursor-pointer rounded border border-ink-300 bg-white p-0.5"
            />
          ) : null}
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={group.placeholder}
            // product_variants.colour is VARCHAR(40); every other
            // group writes into products.attributes, which is not capped
            // below the register’s own 100.
            maxLength={withSwatch ? 40 : 100}
            className="w-64"
            aria-label={`Add a ${group.label.toLowerCase()} value`}
          />
          <Button variant="primary" busy={adding} disabled={!draft.trim()} onClick={add}>
            <Plus className="size-3.5" aria-hidden="true" />
            Add value
          </Button>
        </div>
      </div>

      {values.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-500">
          Nothing recorded yet. Add the first {group.label.toLowerCase()} above and it becomes
          selectable on every product.
        </p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {values.map((value) => (
            <li
              key={value.id}
              className={cx(
                "flex flex-wrap items-center gap-3 px-5 py-2.5",
                !value.active && "bg-ink-50/60",
              )}
            >
              {editingId === value.id ? (
                <>
                  <Input
                    value={editValue}
                    autoFocus
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveRename(value);
                      }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    maxLength={withSwatch ? 40 : 100}
                    className="w-56"
                    aria-label={`Rename ${value.value}`}
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    busy={busyId === value.id}
                    onClick={() => saveRename(value)}
                  >
                    <Check className="size-3.5" aria-hidden="true" />
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    <X className="size-3.5" aria-hidden="true" />
                  </Button>
                  {value.usageCount > 0 ? (
                    <span className="text-[11px] text-amber-700">
                      Renaming updates {value.usageCount} product
                      {value.usageCount === 1 ? "" : "s"} using it.
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  {withSwatch ? (
                    // Committed as soon as the picker closes. A swatch is
                    // a single field with no other half to coordinate,
                    // so a Save button beside it would only be a step
                    // that can be forgotten.
                    <input
                      type="color"
                      value={value.hex || COLOUR_FALLBACK_HEX}
                      disabled={busyId === value.id}
                      onChange={(e) => saveHex(value, e.target.value)}
                      aria-label={`Swatch for ${value.value}`}
                      title={value.hex || "No swatch recorded"}
                      className="size-7 shrink-0 cursor-pointer rounded border border-ink-300 bg-white p-0.5"
                    />
                  ) : null}

                  <span
                    className={cx(
                      "min-w-40 text-sm font-medium",
                      value.active ? "text-ink-800" : "text-ink-400 line-through",
                    )}
                  >
                    {value.value}
                  </span>

                  <span className="text-[11px] text-ink-500">
                    {value.usageCount
                      ? `used by ${value.usageCount} product${value.usageCount === 1 ? "" : "s"}`
                      : "not used yet"}
                  </span>

                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="mr-1 text-[11px] text-ink-500">
                      {value.active ? "Offered" : "Retired"}
                    </span>
                    <Toggle
                      checked={value.active}
                      disabled={busyId === value.id}
                      onChange={() => toggleActive(value)}
                      label={`Offer ${value.value} on new products`}
                      size="sm"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Rename ${value.value}`}
                      disabled={busyId === value.id}
                      onClick={() => {
                        setEditingId(value.id);
                        setEditValue(value.value);
                      }}
                    >
                      <Pencil className="size-3.5 text-ink-400" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${value.value}`}
                      disabled={busyId === value.id || value.usageCount > 0}
                      title={
                        value.usageCount > 0
                          ? "In use — retire it instead"
                          : `Delete ${value.value}`
                      }
                      onClick={() => remove(value)}
                    >
                      <Trash2 className="size-3.5 text-ink-400" aria-hidden="true" />
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {inUse ? (
        <p className="border-t border-ink-100 px-5 py-2.5 text-[11px] text-ink-500">
          A value in use cannot be deleted — retire it to take it out of circulation while the
          products already carrying it keep it.
        </p>
      ) : null}
    </Card>
  );
}
