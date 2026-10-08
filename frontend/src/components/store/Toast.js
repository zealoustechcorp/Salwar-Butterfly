"use client";

/**
 * The storefront's notifications.
 *
 * This started life inside <StoreProvider> as the strip that says "added to
 * bag", and it is lifted out here because it stopped being the bag's alone.
 * Saving an address, correcting a phone number, a checkout the API refused —
 * all of them are the same event from the shopper's side: something they did
 * either worked or did not, and the page they are on should say which without
 * moving under them.
 *
 * Three tones, and the difference between them is how long they stay rather
 * than only what colour they are:
 *
 * - `success` is gone in 2.6 seconds. It confirms something the shopper just
 *   did and already expected to work; leaving it up longer is clutter.
 * - `info` is the same, and exists for the outcomes that are neither — "that
 *   is all of it already", "sold out". Nothing went wrong, but nothing they
 *   asked for happened either.
 * - `error` stays for 6, and carries `role="alert"` so a screen reader
 *   interrupts rather than waiting for a pause. It is the one a shopper has
 *   to actually read before they can act.
 *
 * A toast carrying a link stays up longer still: 2.6s is enough to read a
 * confirmation but not enough to notice a button, decide, and reach it.
 *
 * Colour is never the only signal — each tone has its own icon — because a
 * rose pill and a burgundy pill are the same pill to a good number of the
 * people this shop sells to.
 *
 * The strip itself is click-through. Only the buttons inside take pointer
 * events, so a toast sitting over a product tile never eats a tap.
 *
 * It is *not* a replacement for the message under a field. A toast is gone in
 * seconds and cannot be re-read, so anything the shopper has to fix is written
 * beside the input as well; the toast only tells them to go and look.
 */

import { AlertCircle, Check, Info, X } from "lucide-react";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

const ToastContext = createContext(null);

/** How long each tone stays, in milliseconds. */
const DURATIONS = { success: 2600, info: 2600, error: 6000 };

/** With a link to follow, long enough to notice it and reach it. */
const WITH_ACTION = 5200;

/**
 * The most that may be on screen at once. Beyond this the oldest goes: a
 * stack tall enough to cover the page is worse than the notice it lost.
 */
const MAX_VISIBLE = 3;

const TONES = {
  success: { className: "bg-sb-footer text-sb-bg", Icon: Check },
  info: { className: "bg-sb-footer text-sb-bg", Icon: Info },
  error: { className: "bg-sb-btn-rose text-sb-bg", Icon: AlertCircle },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((toast) => {
    const id = (counter.current += 1);
    const tone = toast.tone ?? "success";

    setToasts((current) =>
      [...current, { tone, ...toast, id }].slice(-MAX_VISIBLE),
    );

    return id;
  }, []);

  /**
   * `detail` is optional on all three and is the sentence under the title —
   * which piece, which field, what the API said. The title alone has to make
   * sense without it, because it is the half that survives on a narrow
   * screen.
   */
  const value = useMemo(
    () => ({
      push,
      dismiss,
      success: (title, detail, options) =>
        push({ tone: "success", title, detail, ...options }),
      info: (title, detail, options) =>
        push({ tone: "info", title, detail, ...options }),
      error: (title, detail, options) =>
        push({ tone: "error", title, detail, ...options }),
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex flex-col items-center gap-2 px-4"
      >
        {/* `dismiss` is passed rather than a `() => dismiss(id)` closure:
            a fresh closure on every render would be a changed dependency
            for each strip's timer, so pushing a second toast would restart
            the first one's clock — or outlive it. */}
        {toasts.map((toast) => (
          <ToastStrip key={toast.id} toast={toast} dismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastStrip({ toast, dismiss }) {
  const { className, Icon } = TONES[toast.tone] ?? TONES.success;
  const { id } = toast;

  const life =
    toast.duration ??
    (toast.action ? WITH_ACTION : (DURATIONS[toast.tone] ?? DURATIONS.success));

  const onDismiss = useCallback(() => dismiss(id), [dismiss, id]);

  // Each strip owns its own timer rather than the provider holding one for
  // the whole queue. Every dependency here is a primitive or the stable
  // `dismiss`, so the clock is set once per toast and is not restarted by
  // the re-render that another toast arriving causes.
  useEffect(() => {
    const timer = setTimeout(onDismiss, life);

    return () => clearTimeout(timer);
  }, [onDismiss, life]);

  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className={cn(
        "sb-enter flex max-w-full items-center gap-3 rounded-full py-2.5 pl-5 shadow-lg shadow-sb-footer/25",
        toast.action ? "pr-2" : "pr-2.5",
        className,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />

      <span className="shrink-0 text-sm font-medium">{toast.title}</span>

      {toast.detail ? (
        <span className="hidden min-w-0 truncate text-xs opacity-75 sm:inline">
          {toast.detail}
        </span>
      ) : null}

      {toast.action ? (
        <Link
          href={toast.action.href}
          onClick={onDismiss}
          className="pointer-events-auto shrink-0 rounded-full bg-sb-bg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap text-sb-footer transition-colors hover:bg-sb-btn-rose hover:text-sb-bg"
        >
          {toast.action.label}
        </Link>
      ) : null}

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="pointer-events-auto -mr-0.5 shrink-0 rounded-full p-1.5 opacity-70 transition-opacity hover:opacity-100"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function useStoreToast() {
  const context = useContext(ToastContext);

  if (!context) throw new Error("useStoreToast must be used inside <ToastProvider>.");

  return context;
}
