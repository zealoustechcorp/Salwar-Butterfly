"use client";

/**
 * The state picker on the checkout form, and the dropdown styling the address
 * fields share.
 *
 * A native <select> was here, and it opened the operating system's own list —
 * grey, square, in the system font — under a form that is otherwise cream,
 * gold and rounded, right next to the area suggestions that already look like
 * the shop. This is the same list drawn by the page, with what the native one
 * did well kept: Downshift's useSelect gives it the listbox ARIA wiring, arrow
 * keys, Enter and Escape, and type-ahead, so pressing "K" still jumps to
 * Karnataka.
 */

import { useSelect } from "downshift";
import { Check, ChevronDown } from "lucide-react";

import { STATES } from "@/lib/states";
import { cn } from "@/lib/utils";

/**
 * The open list under an address field. AreaCombobox uses it too.
 *
 * No scrollbar drawn, like the storefront's other scrolling panels — the
 * system one is grey and square inside a cream, rounded list. Nothing is lost
 * by it: max-h-60 is 6⅔ rows, so a list that scrolls always shows a row cut
 * in half at the bottom edge, which says "more below" on its own.
 */
export const MENU_CLASS =
  "sb-no-scrollbar absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-sb-gold/45 bg-sb-bg py-1 shadow-lg";

/** One row of that list. */
export const optionClass = (highlighted) =>
  cn(
    "flex cursor-pointer items-center justify-between gap-2 px-3.5 py-2 text-sm text-sb-text",
    highlighted && "bg-sb-surface/60 text-sb-heading",
  );

/**
 * @param id the id the field's <label htmlFor> points at; the button takes
 *        it, and the label is found as `${id}-label`
 * @param className the field class, so the closed picker matches the inputs
 */
export function StateSelect({ id, value, onChange, className, invalid }) {
  const { isOpen, getToggleButtonProps, getMenuProps, getItemProps, highlightedIndex } =
    useSelect({
      id,
      toggleButtonId: id,
      labelId: `${id}-label`,
      items: STATES,
      selectedItem: value || null,
      onSelectedItemChange: ({ selectedItem }) => {
        if (selectedItem) onChange(selectedItem);
      },
    });

  return (
    <div className="relative">
      <button
        type="button"
        {...getToggleButtonProps({
          "aria-invalid": invalid || undefined,
          className: cn(className, "flex items-center justify-between gap-2 text-left"),
        })}
      >
        <span className={cn("truncate", !value && "text-sb-text-muted/60")}>
          {value || "Choose your state"}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-sb-gold-text transition-transform",
            isOpen && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      <ul {...getMenuProps()} className={cn(MENU_CLASS, !isOpen && "hidden")}>
        {isOpen
          ? STATES.map((state, index) => (
              <li
                key={state}
                {...getItemProps({ item: state, index })}
                className={optionClass(highlightedIndex === index)}
              >
                {state}
                {state === value ? (
                  <Check className="size-4 shrink-0 text-sb-gold-text" aria-hidden="true" />
                ) : null}
              </li>
            ))
          : null}
      </ul>
    </div>
  );
}
