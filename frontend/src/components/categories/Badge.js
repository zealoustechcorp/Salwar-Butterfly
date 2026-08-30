"use client";

/**
 * @file Badge.js
 * @description Category Status Badge component for the Catalogue module.
 * Visually communicates whether a category is currently "Active" (published and visible
 * on the customer storefront) or "Inactive" (hidden / draft state).
 */

import { Badge as AdminBadge } from "@/components/admin/ui";

/**
 * CategoryBadge Component
 *
 * Renders a pill-shaped status indicator badge with a glowing status dot:
 * - Active: Emerald green dot + green tone border/background ("Active")
 * - Inactive: Neutral gray dot + neutral gray tone border/background ("Inactive")
 *
 * @param {Object} props - Component properties
 * @param {boolean} props.active - Indicates if the category is published/visible
 * @param {string} [props.className] - Optional custom CSS classes for styling overrides
 * @returns {JSX.Element} The rendered category status badge
 */
export default function Badge({ active, className }) {
  return (
    <AdminBadge
      /* Apply emerald green styling for active categories, subtle gray for inactive */
      tone={active ? "green" : "neutral"}
      className={className}
    >
      {/* Decorative colored circle indicating live visibility status */}
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-ink-400"}`}
      />
      {/* Human-readable label */}
      {active ? "Active" : "Inactive"}
    </AdminBadge>
  );
}

