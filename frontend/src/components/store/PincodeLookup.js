"use client";

/**
 * PIN code autofill for the two address forms (F-05.03, F-08.05).
 *
 * Checkout and the address book keep their own fields — see the header of
 * AddressBook.js for why — but they want the same three things from a PIN
 * code, so those live here:
 *
 *   usePincodeLookup     what the code currently typed resolves to, for the
 *                        hint under the PIN field and the area suggestions
 *   usePincodeAutofill   fills city and state when the shopper types a code
 *   AreaCombobox         the "Area" input, offering the post office areas
 *                        under that code while still taking free text
 *
 * The autofill runs on typing, not on every change of the value. A saved
 * address that is opened for editing, or picked at checkout, already says
 * where it is; re-deriving its state from the directory would quietly
 * rewrite something the shopper chose.
 *
 * Nothing here refuses anything. A code the directory does not know is
 * still a code the shop ships to (see lib/store/pincodes.js), so a miss is
 * a hint asking the shopper to type the rest, not an error.
 */

import { useCombobox } from "downshift";
import { Check, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { lookupPincode } from "@/lib/store/pincodes";
import { PINCODE_REGEX } from "@/lib/validate";
import { cn } from "@/lib/utils";
import { MENU_CLASS, optionClass } from "./StateSelect";

const isPincode = (value) => PINCODE_REGEX.test(String(value ?? "").trim());

/**
 * What the PIN code in the form currently resolves to.
 *
 * Status is derived during render from which code the stored answer is
 * for, rather than reset in the effect: the moment the code changes, the
 * old answer stops applying, without a render that shows it against the
 * new code first.
 *
 * @returns {{ status: "idle" | "loading" | "found" | "notFound" | "error",
 *             result: object | null }}
 */
export function usePincodeLookup(pincode) {
  const code = String(pincode ?? "").trim();
  const valid = isPincode(code);

  const [answer, setAnswer] = useState(null);

  useEffect(() => {
    if (!valid) return;

    const controller = new AbortController();

    lookupPincode(code, { signal: controller.signal })
      .then((result) => setAnswer({ code, result }))
      .catch((cause) => {
        if (cause?.name !== "AbortError") {
          setAnswer({ code, result: { ok: false, notFound: false } });
        }
      });

    return () => controller.abort();
  }, [code, valid]);

  if (!valid) return { status: "idle", result: null };
  if (answer?.code !== code) return { status: "loading", result: null };

  const { result } = answer;

  if (result.ok) return { status: "found", result };
  return { status: result.notFound ? "notFound" : "error", result: null };
}

/**
 * Fill city and state from a PIN code the shopper has just typed.
 *
 * Returns the function to call from the PIN field's change handler.
 *
 * State is always taken from the directory — it is the one field a PIN
 * code settles. City only replaces an empty box or the city this form
 * filled in itself last time, so a shopper who corrects a mistyped code
 * gets the new city, and one who typed "Kovai" keeps it.
 *
 * The answer is applied only if the form still holds the code it was
 * asked about. Typing 641012 and then quickly fixing it to 641018 must
 * not land the first answer on top of the second.
 *
 * The decision is made inside the state updater, against the values as
 * they are when it runs — not as they were when the lookup started, and
 * not via a variable the updater sets for code after it, since React does
 * not promise to run an updater before `setValues` returns. The updater
 * reads nothing it also writes, so running it twice decides the same way.
 *
 * @param setValues the form's state setter; values need `postalCode`,
 *        `city` and `state`
 * @param onFill called after an answer arrives, so the form can clear any
 *        city or state error the fill may have just answered
 */
export function usePincodeAutofill(setValues, onFill) {
  const filledCity = useRef(null);

  return useCallback(
    (pincode) => {
      if (!isPincode(pincode)) return;

      lookupPincode(pincode)
        .then((result) => {
          if (!result.ok) return;

          // Read once, out here. The updater below writes the ref, and React
          // runs updaters twice in development — a second run that read the
          // ref would see this fill's city as the "previous" one and decide
          // the opposite way.
          const previous = filledCity.current;

          setValues((current) => {
            if (String(current.postalCode ?? "").trim() !== result.pincode) return current;

            const city = String(current.city ?? "").trim();
            const replaceCity = Boolean(result.city) && (!city || city === previous);

            if (replaceCity) filledCity.current = result.city;

            return {
              ...current,
              state: result.state || current.state,
              city: replaceCity ? result.city : current.city,
            };
          });

          onFill?.();
        })
        // A lookup that fails leaves the form as the shopper typed it,
        // which is exactly what the form looked like before this existed.
        .catch(() => {});
    },
    [setValues, onFill],
  );
}

/**
 * The hint under the PIN code field.
 *
 * Falls back to `idleHint` — what the field said before the lookup existed
 * — whenever there is nothing more useful to say.
 */
export function pincodeHint({ status, result }, idleHint) {
  if (status === "loading") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        Looking up this PIN code…
      </span>
    );
  }

  if (status === "found") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sb-heading">
        <Check className="size-3 text-sb-gold-text" aria-hidden="true" />
        {[result.city, result.state].filter(Boolean).join(", ")}
      </span>
    );
  }

  if (status === "notFound") {
    return "We do not have this PIN code on file — fill in the city and state yourself.";
  }

  return idleHint;
}

/**
 * The "Area" input, with the post office areas under the PIN code offered
 * as suggestions.
 *
 * Free text first. The suggestions are post office names, which is what
 * most shoppers would write here but not all of them — a colony or a
 * street name is just as good to a courier — so the input takes whatever
 * is typed and the list only narrows as they type.
 *
 * Downshift rather than a native <datalist>: a datalist renders as a
 * different widget on every mobile browser, and on some not at all, and
 * gives no control over how the list looks next to the rest of the form.
 * Downshift supplies the combobox ARIA wiring and keyboard handling and
 * leaves the markup here.
 */
export function AreaCombobox({
  id,
  value,
  onChange,
  areas,
  placeholder,
  invalid,
  describedBy,
  className,
}) {
  const query = String(value ?? "").trim().toLowerCase();

  // Every area until something is typed, then the ones that contain it.
  // An exact match is hidden: offering "Tatabad" to somebody who has
  // finished typing "Tatabad" is a list in the way of the next field.
  const items = query
    ? areas.filter((area) => {
        const name = area.toLowerCase();
        return name.includes(query) && name !== query;
      })
    : areas;

  // No "open on focus" of our own: Downshift already opens the list on a
  // click and on the arrow keys, and opening it on focus as well means the
  // click that focused the input immediately toggles it shut again.
  const { isOpen, getInputProps, getMenuProps, getItemProps, highlightedIndex } =
    useCombobox({
      id,
      inputId: id,
      items,
      inputValue: value,
      // Only the text is controlled. A pick reaches the form as the input
      // value Downshift writes for it, so this one handler covers typing and
      // picking alike. `selectedItem` is left to Downshift on purpose:
      // pinning it to null looks like "free text only", but Downshift then
      // sees its pick undone by the prop on the next render and clears the
      // input it has just filled — which is what a click on an area did.
      onInputValueChange: ({ inputValue }) => onChange(inputValue ?? ""),
    });

  const showMenu = isOpen && items.length > 0;

  return (
    <div className="relative">
      <input
        {...getInputProps({
          placeholder,
          // The browser's own autofill list would open on top of this one.
          autoComplete: areas.length ? "off" : "address-line2",
          "aria-invalid": invalid || undefined,
          "aria-describedby": describedBy,
          className,
        })}
      />

      <ul {...getMenuProps()} className={cn(MENU_CLASS, !showMenu && "hidden")}>
        {showMenu
          ? items.map((area, index) => (
              <li
                key={area}
                {...getItemProps({ item: area, index })}
                className={optionClass(highlightedIndex === index)}
              >
                {area}
              </li>
            ))
          : null}
      </ul>
    </div>
  );
}
