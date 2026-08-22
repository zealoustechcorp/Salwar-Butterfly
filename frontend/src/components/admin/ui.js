"use client";

import { Check, Info, Inbox, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** House alias for shadcn's cn() — conditional classes + Tailwind conflict merging. */
export const cx = cn;

// --- Button -----------------------------------------------------------------

const BUTTON_VARIANTS = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600 disabled:bg-brand-300",
  secondary:
    "bg-white text-ink-700 ring-1 ring-inset ring-ink-300 hover:bg-ink-50 focus-visible:outline-ink-500 disabled:text-ink-400",
  ghost: "text-ink-600 hover:bg-ink-100 focus-visible:outline-ink-500 disabled:text-ink-300",
  danger:
    "bg-white text-red-700 ring-1 ring-inset ring-red-300 hover:bg-red-50 focus-visible:outline-red-600 disabled:text-red-300",
  // gold-700, not the logo's gold-500: white on #BC8A69 is only 3.01:1.
  gold: "bg-gold-700 text-white hover:bg-gold-800 focus-visible:outline-gold-700 disabled:bg-gold-300",
};

const BUTTON_SIZES = {
  sm: "h-8 px-2.5 text-xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2",
};

export function Button({
  variant = "secondary",
  size = "md",
  busy = false,
  className,
  children,
  disabled,
  ...props
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      className={cx(
        "inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap",
        "transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:active:scale-100",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {busy ? <Spinner className="size-3.5" /> : null}
      {children}
    </button>
  );
}

/** Same visual language as <Button>, but a real anchor — never nest one inside the other. */
export function LinkButton({ href, variant = "secondary", size = "md", className, children, ...props }) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap",
        "transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97]",
        "focus-visible:outline-2 focus-visible:outline-offset-2",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}

export function Spinner({ className }) {
  return (
    <svg className={cx("animate-spin", className || "size-4")} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// --- Badge ------------------------------------------------------------------

const BADGE_TONES = {
  neutral: "bg-ink-100 text-ink-700 ring-ink-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  gold: "bg-gold-50 text-gold-700 ring-gold-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function Badge({ tone = "neutral", className, children, ...props }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

// --- Form controls ----------------------------------------------------------

export function Field({ label, hint, error, required, children, className }) {
  return (
    <label className={cx("block", className)}>
      {label ? (
        <span className="mb-1.5 flex items-baseline gap-1 text-xs font-semibold text-ink-700">
          {label}
          {required ? <span className="text-brand-600">*</span> : null}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink-500">{hint}</span>
      ) : null}
    </label>
  );
}

const CONTROL =
  "block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-ink-900 ring-1 ring-inset ring-ink-300 " +
  "placeholder:text-ink-400 focus:ring-2 focus:ring-inset focus:ring-brand-600 disabled:bg-ink-50 disabled:text-ink-400";

export function Input({ className, invalid, ...props }) {
  return <input className={cx(CONTROL, invalid && "ring-red-400 focus:ring-red-500", className)} {...props} />;
}

export function Textarea({ className, invalid, ...props }) {
  return (
    <textarea
      rows={4}
      className={cx(CONTROL, "resize-y", invalid && "ring-red-400 focus:ring-red-500", className)}
      {...props}
    />
  );
}

/**
 * Radix-powered dropdown that keeps the native `<select>` API the rest of the
 * admin already uses: `value`, `onChange` (reads `e.target.value`), `<option>`
 * children. Radix items reject empty-string values, so "" round-trips through
 * a sentinel.
 */
const SELECT_EMPTY = "__empty__";

function collectOptions(children, out = []) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === "option") {
      out.push({
        value: String(child.props.value ?? ""),
        label: child.props.children,
        disabled: Boolean(child.props.disabled),
      });
    } else if (child.props?.children) {
      collectOptions(child.props.children, out);
    }
  });
  return out;
}

export function Select({ className, invalid, value, onChange, disabled, children, ...props }) {
  const options = collectOptions(children);
  const current = value == null || value === "" ? SELECT_EMPTY : String(value);
  return (
    <SelectRoot
      value={current}
      onValueChange={(next) =>
        onChange?.({ target: { value: next === SELECT_EMPTY ? "" : next } })
      }
      disabled={disabled}
    >
      <SelectTrigger
        size="none"
        className={cx(
          "h-9.5 w-full rounded-lg border-0 bg-white shadow-none ring-1 ring-inset ring-ink-300",
          "text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-600 disabled:bg-ink-50 disabled:text-ink-400 disabled:opacity-100",
          invalid && "ring-red-400 focus-visible:ring-red-500",
          className,
        )}
        {...props}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        position="popper"
        className="rounded-lg border-ink-200 shadow-lg shadow-ink-900/10"
      >
        {options.map((option) => (
          <SelectItem
            key={option.value || SELECT_EMPTY}
            value={option.value || SELECT_EMPTY}
            disabled={option.disabled}
            className="rounded-md py-2 text-ink-800 focus:bg-brand-50 focus:text-brand-800 data-[state=checked]:font-medium data-[state=checked]:text-brand-700"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  );
}

export function Checkbox({ className, label, ...props }) {
  const content = (
    <input
      type="checkbox"
      className={cx(
        "size-4 shrink-0 rounded border-ink-300 text-brand-600 accent-brand-600",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
        className,
      )}
      {...props}
    />
  );
  if (!label) return content;
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-700">
      {content}
      {label}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled, size = "md" }) {
  const dims = size === "sm" ? { w: "w-8", h: "h-4.5", k: "size-3.5", x: "translate-x-3.5" } : { w: "w-10", h: "h-5.5", k: "size-4.5", x: "translate-x-4.5" };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex shrink-0 cursor-pointer rounded-full p-0.5 transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
        dims.w,
        dims.h,
        checked ? "bg-brand-600" : "bg-ink-300",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cx(
          "pointer-events-none rounded-full bg-white shadow-sm transition-transform",
          dims.k,
          checked ? dims.x : "translate-x-0",
        )}
      />
    </button>
  );
}

// --- Layout helpers ---------------------------------------------------------

export function Card({ className, children, ...props }) {
  return (
    <section
      className={cx("rounded-xl bg-white ring-1 ring-ink-200/80 shadow-sm shadow-ink-900/[0.03]", className)}
      {...props}
    >
      {children}
    </section>
  );
}

export function CardHeader({ title, description, actions, requirement }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200/80 px-5 py-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          {title}
          {requirement ? <RequirementTag id={requirement} /> : null}
        </h2>
        {description ? <p className="mt-1 text-xs text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Traceability chip back to the FRS clause a control implements. */
export function RequirementTag({ id, className }) {
  return (
    <span
      title={`FRS requirement ${id}`}
      className={cx(
        "rounded border border-gold-300 bg-gold-50 px-1.5 py-px font-mono text-[10px] font-semibold text-gold-700",
        className,
      )}
    >
      {id}
    </span>
  );
}

export function EmptyState({ title, description, action, icon }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-ink-100 text-ink-400 [&_svg]:size-5">
        {icon ?? <Inbox aria-hidden="true" />}
      </div>
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-ink-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorNotice({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg bg-red-50 p-3 ring-1 ring-inset ring-red-200">
      <TriangleAlert aria-hidden="true" className="mt-px size-4 shrink-0 text-red-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-red-800">{error.message || "Something went wrong."}</p>
        {error.code ? <p className="mt-0.5 font-mono text-[11px] text-red-600">{error.code}</p> : null}
      </div>
      {onRetry ? (
        <Button size="sm" variant="danger" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function SkeletonRows({ rows = 6, className }) {
  return (
    <div className={cx("space-y-2 p-4", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="size-10 animate-pulse rounded-md bg-ink-100" />
          <div className="h-3 flex-1 animate-pulse rounded bg-ink-100" style={{ maxWidth: `${70 - i * 4}%` }} />
          <div className="h-3 w-16 animate-pulse rounded bg-ink-100" />
        </div>
      ))}
    </div>
  );
}

// --- Modal ------------------------------------------------------------------

export function Modal({ open, onClose, title, description, requirement, children, footer, size = "md" }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial="hidden"
          animate="visible"
          exit="hidden"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
        >
          <motion.div
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed inset-0 bg-ink-900/40 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={ref}
            variants={{
              hidden: { opacity: 0, y: 10, scale: 0.97 },
              visible: { opacity: 1, y: 0, scale: 1 },
            }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cx(
              "relative w-full rounded-xl bg-white shadow-xl ring-1 ring-ink-900/10 outline-none",
              widths[size],
            )}
          >
            <header className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
              <div>
                <h2 id={titleId} className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                  {title}
                  {requirement ? <RequirementTag id={requirement} /> : null}
                </h2>
                {description ? <p className="mt-1 text-xs text-ink-500">{description}</p> : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-m-1 rounded p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </header>
            <div className="px-5 py-4">{children}</div>
            {footer ? (
              <footer className="flex items-center justify-end gap-2 border-t border-ink-200 bg-ink-50/60 px-5 py-3">
                {footer}
              </footer>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// --- Toasts -----------------------------------------------------------------

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast) => {
      const id = ++counter.current;
      setToasts((current) => [...current, { id, tone: "success", ...toast }]);
      setTimeout(() => dismiss(id), toast.duration ?? 4200);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      success: (message, detail) => push({ tone: "success", message, detail }),
      error: (message, detail) => push({ tone: "error", message, detail, duration: 6000 }),
      info: (message, detail) => push({ tone: "info", message, detail }),
    }),
    [push],
  );

  const tones = {
    success: "ring-emerald-200 bg-emerald-50 text-emerald-900",
    error: "ring-red-200 bg-red-50 text-red-900",
    info: "ring-brand-200 bg-brand-50 text-brand-900",
  };
  const icons = { success: Check, error: TriangleAlert, info: Info };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const ToastIcon = icons[toast.tone];
            return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 32, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className={cx(
                "pointer-events-auto flex items-start gap-2.5 rounded-lg px-3.5 py-3 shadow-lg ring-1",
                tones[toast.tone],
              )}
            >
              <ToastIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{toast.message}</p>
                {toast.detail ? <p className="mt-0.5 text-xs opacity-80">{toast.detail}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                className="-m-1 rounded p-1 opacity-60 transition-opacity hover:opacity-100"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>.");
  return context;
}
