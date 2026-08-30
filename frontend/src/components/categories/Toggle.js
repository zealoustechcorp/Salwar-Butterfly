"use client";

/**
 * @file Toggle.js
 * @description Interactive boolean toggle switch for category active/inactive states.
 * Wraps the base Admin UI Toggle component to provide instant status switching from category cards,
 * detail headers, and form sections without requiring full form submission.
 */

import { Toggle as AdminToggle } from "@/components/admin/ui";

/**
 * CategoryToggle Component
 *
 * Provides an accessible, animated toggle switch for flipping a category's visibility state.
 *
 * @param {Object} props - Component properties
 * @param {boolean} props.checked - Current boolean state (true = active, false = inactive)
 * @param {Function} props.onChange - Event callback invoked when the user toggles the switch
 * @param {boolean} [props.disabled=false] - Whether the toggle switch is disabled
 * @param {"sm"|"md"} [props.size="md"] - Size variant ("sm" for floating card badges, "md" for forms/detail bars)
 * @returns {JSX.Element} The rendered toggle control
 */
export default function Toggle({ checked, onChange, disabled, size = "md" }) {
  return (
    <AdminToggle
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      size={size}
    />
  );
}

