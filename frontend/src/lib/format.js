const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrPrecise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
});

export function money(value, { precise = false } = {}) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return precise ? inrPrecise.format(Number(value)) : inr.format(Number(value));
}

export function number(value) {
  return new Intl.NumberFormat("en-IN").format(Number(value) || 0);
}

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function shortDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

export function relativeDate(value) {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";
  const days = Math.round((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

export const FIT_LABEL = {
  slim_fit: "Slim Fit",
  normal_fit: "Normal Fit",
  special_dress: "Special Dress",
};

export const STOCK_LABEL = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  unavailable: "Unavailable",
};

/** Readable contrast pick for text sitting on a colour swatch. */
export function readableOn(hex) {
  if (!hex) return "#0f172a";
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#0f172a" : "#ffffff";
}
