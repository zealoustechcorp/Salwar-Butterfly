"use client";

/**
 * The recent-order pop-up (F-09.09).
 *
 * A small card in the corner of the storefront: "Someone from Chennai just
 * bought Anarkali Set", with the piece's photograph. Clicking it opens that
 * piece. It cycles through up to ten recent paid orders and never shows a
 * customer's name — only the city the parcel went to.
 *
 * Kept deliberately short: the switch, then how the pop-up behaves —
 *
 *   1. Stay until closed, or Timer.
 *   2. Timer only: show for N seconds.
 *   3. Next pop-up after N seconds — counted from whenever a pop-up goes,
 *      timer or ✕ alike (and before the first one).
 *
 * plus the look-back window. Off by default; the storefront picks up a
 * change within about a minute.
 */

import { BellRing, Hand, RefreshCw, Timer } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  Button,
  Card,
  CardHeader,
  ErrorNotice,
  Input,
  SkeletonRows,
  Toggle,
  cx,
  useToast,
} from "@/components/admin/ui";
import {
  DISPLAY_MODE,
  GAP_SECONDS,
  LOOKBACK_DAYS,
  MAX_POPUP_ORDERS,
  VISIBLE_SECONDS,
  getPopupSettings,
  updatePopupSettings,
} from "@/lib/api/recentOrderPopup";

const RANGES = {
  visibleSeconds: VISIBLE_SECONDS,
  gapSeconds: GAP_SECONDS,
  lookbackDays: LOOKBACK_DAYS,
};

const MODES = [
  { value: DISPLAY_MODE.UNTIL_CLOSED, label: "Show until closed", Icon: Hand },
  { value: DISPLAY_MODE.TIMER, label: "Close automatically", Icon: Timer },
];

/** A field's own error, checked here before the server is asked. */
function rangeError(name, value) {
  const { min, max } = RANGES[name];
  const number = Number(value);

  if (String(value).trim() === "" || !Number.isInteger(number) || number < min || number > max) {
    return `Enter a whole number from ${min} to ${max}`;
  }

  return null;
}

/** What the settings mean, in one line. */
function summary({ displayMode, visibleSeconds, gapSeconds }) {
  const gap = Number(gapSeconds);
  if (!Number.isInteger(gap) || gap < 1) return null;

  if (displayMode === DISPLAY_MODE.UNTIL_CLOSED) {
    return `Each pop-up stays until the shopper closes it. The next one comes ${gap}s later.`;
  }

  const visible = Number(visibleSeconds);
  if (!Number.isInteger(visible) || visible < 1) return null;

  return `Each pop-up shows for ${visible}s and then closes (or sooner, if the shopper closes it). The next one comes ${gap}s later.`;
}

export default function RecentOrderPopupPage() {
  const toast = useToast();

  const [state, setState] = useState({ status: "loading", error: null });
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    getPopupSettings({ signal: controller.signal })
      .then((settings) => {
        if (!active) return;
        setForm(settings);
        setSaved(settings);
        setErrors({});
        setState({ status: "ready", error: null });
      })
      .catch((error) => {
        if (active && error?.name !== "AbortError") setState({ status: "error", error });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reload]);

  const refresh = useCallback(() => {
    setState({ status: "loading", error: null });
    setReload((n) => n + 1);
  }, []);

  async function save(next) {
    const fieldErrors = {};
    for (const name of Object.keys(RANGES)) {
      const message = rangeError(name, next[name]);
      if (message) fieldErrors[name] = message;
    }

    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return false;

    setBusy(true);
    try {
      const result = await updatePopupSettings(next);
      setForm(result);
      setSaved(result);
      return result;
    } catch (error) {
      if (error?.fields) setErrors(error.fields);
      toast.error("Could not save the pop-up settings", error?.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  // The switch saves at once, with the settings as last saved.
  async function toggle(enabled) {
    const result = await save({ ...saved, enabled });
    if (result) {
      toast.success(
        enabled ? "Pop-up turned on" : "Pop-up turned off",
        "The storefront picks this up within a minute.",
      );
    }
  }

  async function submit(event) {
    event.preventDefault();
    const result = await save({ ...form, enabled: saved.enabled });
    if (result) toast.success("Pop-up settings saved");
  }

  const dirty =
    form &&
    saved &&
    (form.displayMode !== saved.displayMode ||
      String(form.visibleSeconds) !== String(saved.visibleSeconds) ||
      String(form.gapSeconds) !== String(saved.gapSeconds) ||
      String(form.lookbackDays) !== String(saved.lookbackDays));

  const timerMode = form?.displayMode === DISPLAY_MODE.TIMER;

  const setField = (name) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  /**
   * One setting on one line: what it is on the left, a small number box
   * with its unit on the right. Stacks on narrow phones so the label is
   * never squeezed.
   */
  const settingRow = ({ name, label, hint, unit, range }) => {
    const id = `popup-${name}`;
    const hintId = `${id}-hint`;
    return (
      <div className="flex flex-col gap-2 py-3 min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between min-[400px]:gap-4">
        <div className="min-w-0">
          <label htmlFor={id} className="block text-sm font-medium text-ink-900">
            {label}
          </label>
          {hint ? (
            <p id={hintId} className="mt-0.5 text-xs text-ink-500">
              {hint}
            </p>
          ) : null}
          {errors[name] ? <p className="mt-1 text-xs text-red-600">{errors[name]}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={range.min}
            max={range.max}
            step={1}
            value={form[name]}
            onChange={setField(name)}
            invalid={Boolean(errors[name])}
            disabled={busy}
            aria-describedby={hint ? hintId : undefined}
            className="w-20 text-center tabular-nums"
          />
          <span className="w-8 text-xs text-ink-500">{unit}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={
            <>
              <BellRing className="size-4 text-brand-600" aria-hidden="true" />
              Recent orders pop-up
            </>
          }
          description="A small card on the storefront, e.g. “Someone from Chennai just bought Anarkali Set”. Clicking it opens that product."
          actions={
            <Button
              size="sm"
              variant="ghost"
              className="size-9 px-0 sm:size-8"
              onClick={refresh}
              title="Reload"
            >
              <RefreshCw className="size-3.5" />
            </Button>
          }
        />

        {state.status === "loading" ? <SkeletonRows rows={3} /> : null}

        {state.status === "error" ? (
          <div className="p-4">
            <ErrorNotice error={state.error} onRetry={refresh} />
          </div>
        ) : null}

        {state.status === "ready" && form ? (
          <div className="divide-y divide-ink-200/80">
            <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
              <p className="text-sm font-medium text-ink-900">
                {saved.enabled ? "Pop-up is on" : "Pop-up is off"}
              </p>
              <Toggle
                checked={saved.enabled}
                onChange={toggle}
                disabled={busy}
                label="Show the recent orders pop-up"
              />
            </div>

            <form onSubmit={submit} className="px-4 py-4 sm:px-5" noValidate>
              <div className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <p className="text-sm font-medium text-ink-900">How it closes</p>
                <div
                  role="radiogroup"
                  aria-label="How it closes"
                  className="grid grid-cols-2 gap-1 rounded-lg bg-white p-1 ring-1 ring-inset ring-ink-300 sm:inline-grid"
                >
                  {MODES.map((mode) => {
                    const selected = form.displayMode === mode.value;
                    return (
                      <button
                        key={mode.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={busy}
                        onClick={() => setForm((current) => ({ ...current, displayMode: mode.value }))}
                        className={cx(
                          "inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-center text-sm leading-tight font-medium transition-colors sm:px-3 sm:whitespace-nowrap",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                          selected
                            ? "bg-brand-600 text-white shadow-sm"
                            : "text-ink-700 hover:bg-ink-100 hover:text-ink-900",
                        )}
                      >
                        <mode.Icon className="size-4 shrink-0" aria-hidden="true" />
                        {mode.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="divide-y divide-ink-200/80 border-t border-ink-200/80">
                {timerMode
                  ? settingRow({
                      name: "visibleSeconds",
                      label: "Show for",
                      hint: "How long each pop-up stays on screen.",
                      unit: "sec",
                      range: VISIBLE_SECONDS,
                    })
                  : null}
                {settingRow({
                  name: "gapSeconds",
                  label: "Next pop-up after",
                  hint: "After a pop-up closes, by itself or by the shopper.",
                  unit: "sec",
                  range: GAP_SECONDS,
                })}
                {settingRow({
                  name: "lookbackDays",
                  label: "Orders from the last",
                  hint: `Paid, not cancelled or refunded. Up to ${MAX_POPUP_ORDERS} shown.`,
                  unit: "days",
                  range: LOOKBACK_DAYS,
                })}
              </div>

              {summary(form) ? (
                <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-700 ring-1 ring-inset ring-ink-200">
                  {summary(form)}
                </p>
              ) : null}

              <div className="mt-4 flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  busy={busy}
                  disabled={busy || !dirty}
                  className="w-full sm:w-auto"
                >
                  Save
                </Button>
              </div>
            </form>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
