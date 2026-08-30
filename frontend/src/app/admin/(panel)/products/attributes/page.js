"use client";

import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ColourSwatch } from "@/components/admin/ProductThumb";
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
import { addAttributeValue, getBootstrap, listProducts, setAttributeApproval } from "@/lib/api/products";

const GROUPS = [
  {
    key: "sizes",
    title: "Sizes",
    description: "Offered in the variant builder and the bulk size run.",
    placeholder: "e.g. 4XL",
  },
  {
    key: "colours",
    title: "Colours",
    description: "Each colour carries the hex used for storefront swatches.",
    placeholder: "e.g. Indigo",
    hasHex: true,
  },
  { key: "fabrics", title: "Fabrics", description: "Recorded on the product.", placeholder: "e.g. Linen" },
  { key: "works", title: "Work", description: "Embellishment or print type.", placeholder: "e.g. Block Print" },
  { key: "sleeves", title: "Sleeves", description: "Sleeve length options.", placeholder: "e.g. Cap" },
];

/**
 * F-03.09 — "Manage approved attributes/variants."
 *
 * Unapproving a value never rewrites history: existing variants keep it, and the
 * value simply stops being offered for new ones. The usage counts make that
 * consequence visible before the toggle is flipped.
 */
export default function AttributesPage() {
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(null);
  const [state, setState] = useState({ attributes: null, usage: { sizes: {}, colours: {} }, error: null });

  useEffect(() => {
    let active = true;
    Promise.all([getBootstrap(), listProducts({ sort: "name_asc" })])
      .then(([reference, list]) => {
        // Usage is counted across everything the list can see, so the admin
        // knows what an unapproval leaves behind.
        const sizes = {};
        const colours = {};
        for (const product of list.rows)
          for (const variant of product.variants) {
            sizes[variant.size] = (sizes[variant.size] || 0) + 1;
            colours[variant.colour] = (colours[variant.colour] || 0) + 1;
          }
        if (active) setState({ attributes: reference.attributes, usage: { sizes, colours }, error: null });
      })
      .catch((err) => {
        if (active) setState((current) => ({ ...current, error: err }));
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const load = useCallback(() => setReload((n) => n + 1), []);
  const { attributes, usage, error } = state;

  async function toggle(group, value, approved) {
    setBusy(`${group}:${value}`);
    try {
      const outcome = await setAttributeApproval(group, value, approved);
      toast.success(outcome.message);
      load();
    } catch (err) {
      toast.error(err.message || "Could not update the attribute.");
    } finally {
      setBusy(null);
    }
  }

  async function add(group, value, hex) {
    setBusy(`add:${group}`);
    try {
      const created = await addAttributeValue(group, { value, hex });
      toast.success(`"${created.value}" added and approved.`);
      load();
    } catch (err) {
      toast.error(err.message || "Could not add the value.");
    } finally {
      setBusy(null);
    }
  }

  if (error && !attributes)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <ErrorNotice error={error} onRetry={load} />
        <LinkButton href="/admin/products">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to products
        </LinkButton>
      </div>
    );

  if (!attributes) return <SkeletonRows rows={10} className="mx-auto max-w-4xl" />;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">Approved attributes</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            The register the variant builder draws from. Unapproving a value stops it being offered for
            new variants; products already using it are untouched.
          </p>
        </div>
        <LinkButton variant="ghost" href="/admin/products">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to products
        </LinkButton>
      </div>

      {GROUPS.map((group) => (
        <AttributeGroup
          key={group.key}
          group={group}
          values={attributes[group.key] || []}
          usage={usage[group.key] || {}}
          busy={busy}
          onToggle={(value, approved) => toggle(group.key, value, approved)}
          onAdd={(value, hex) => add(group.key, value, hex)}
        />
      ))}
    </div>
  );
}

function AttributeGroup({ group, values, usage, busy, onToggle, onAdd }) {
  const [draft, setDraft] = useState("");
  const [hex, setHex] = useState("#c21e56");

  const approvedCount = values.filter((v) => v.approved).length;

  return (
    <Card>
      <CardHeader
        title={group.title}
        requirement="F-03.09"
        description={group.description}
        actions={
          <Badge tone="neutral">
            {approvedCount} of {values.length} approved
          </Badge>
        }
      />

      <ul className="divide-y divide-ink-100">
        {values.map((entry) => {
          const used = usage[entry.value] || 0;
          const key = `${group.key}:${entry.value}`;
          return (
            <li key={entry.value} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
              <span className={cx("text-sm font-medium", entry.approved ? "text-ink-800" : "text-ink-400")}>
                {group.hasHex ? (
                  <ColourSwatch hex={entry.hex} name={entry.value} />
                ) : (
                  entry.value
                )}
              </span>
              {group.hasHex ? (
                <span className="font-mono text-[11px] text-ink-400">{entry.hex}</span>
              ) : null}

              <span className="ml-auto flex items-center gap-3">
                {used ? (
                  <span className="text-[11px] text-ink-500">
                    used by {used} variant{used === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span className="text-[11px] text-ink-300">unused</span>
                )}
                <Badge tone={entry.approved ? "green" : "slate"}>
                  {entry.approved ? "Approved" : "Retired"}
                </Badge>
                <Toggle
                  checked={entry.approved}
                  onChange={(value) => onToggle(entry.value, value)}
                  disabled={busy === key}
                  label={`Approve ${entry.value}`}
                  size="sm"
                />
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2 border-t border-ink-200 bg-ink-50/60 px-5 py-3">
        {group.hasHex ? (
          <input
            type="color"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            aria-label={`Hex for the new ${group.title.toLowerCase()} value`}
            className="h-9 w-12 cursor-pointer rounded border border-ink-300 bg-white p-1"
          />
        ) : null}
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={group.placeholder}
          aria-label={`Add a ${group.title.toLowerCase()} value`}
          className="max-w-56"
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              onAdd(draft.trim(), hex);
              setDraft("");
            }
          }}
        />
        <Button
          variant="secondary"
          busy={busy === `add:${group.key}`}
          disabled={!draft.trim()}
          onClick={() => {
            onAdd(draft.trim(), hex);
            setDraft("");
          }}
        >
          Add value
        </Button>
      </div>
    </Card>
  );
}
