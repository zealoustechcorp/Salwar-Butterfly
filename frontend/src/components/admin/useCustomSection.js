"use client";

import { useEffect, useRef, useState } from "react";

import { getProductSections, listSections, setProductSections } from "@/lib/api/homeSections";

const KEY = "custom";

/**
 * The "Show in <custom section>" switch on the product form (F-06).
 *
 * Reads the section's current name — so the switch says "Show in Best
 * sellers" or "Show in Diwali Sale" — and, for an existing product, whether
 * the product is already in it. `save(productId)` writes the choice; the
 * product pages call it after the product itself has saved, because it is
 * a separate request against the home sections API.
 *
 * `field` is what DetailsFields takes as `customSection`, or null while the
 * section's name is still loading or could not be read — the switch is then
 * left off the form rather than shown with a blank name.
 *
 * @param {string|null} productId the product being edited; null on "new"
 */
export function useCustomSection(productId = null) {
  const [title, setTitle] = useState(null);
  const [checked, setChecked] = useState(false);
  const saved = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    Promise.all([
      listSections({ signal: controller.signal }),
      productId ? getProductSections(productId, { signal: controller.signal }) : Promise.resolve([]),
    ])
      .then(([sections, keys]) => {
        if (!active) return;
        const section = sections.find((item) => item.key === KEY);
        setTitle(section?.title ?? null);
        saved.current = keys.includes(KEY);
        setChecked(saved.current);
      })
      .catch(() => {
        // Without the section's name the switch is not shown; the rest of
        // the form is unaffected.
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [productId]);

  /**
   * Writes the switch, if it changed since it was read.
   *
   * @returns {Promise<boolean>} whether anything was written
   */
  async function save(id) {
    if (checked === saved.current) return false;
    await setProductSections(id, checked ? [KEY] : []);
    saved.current = checked;
    return true;
  }

  return {
    field: title ? { title, checked, onChange: setChecked } : null,
    checked,
    title,
    save,
  };
}
