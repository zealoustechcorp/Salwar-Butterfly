import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Class combiner used across the app and required by shadcn/ui components.
 * clsx handles conditionals/arrays, twMerge resolves Tailwind conflicts
 * (e.g. a caller's `px-4` beats a component default `px-3`).
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
