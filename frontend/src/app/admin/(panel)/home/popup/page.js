"use client";

/**
 * The recent-order pop-up (F-09.09).
 *
 * A small card in the corner of the storefront: "Someone from Chennai just
 * bought Anarkali Set", with the piece's photograph. Clicking it opens
 * that piece. It cycles through up to ten recent paid orders and never
 * shows a customer's name — only the city the parcel went to.
 *
 * This screen is its switch, its look-back window, how long each pop-up
 * stays on screen and the gap between pop-ups. The first one always comes
 * 5 seconds after a page loads. Off by default; the storefront picks up a
 * change within about a minute.
 */

import { BellRing, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  Button,
  Card,
  CardHeader,
  ErrorNotice,
  Field,
  Input,
  SkeletonRows,
  Toggle,
  useToast,
} from "@/components/admin/ui";
import {
  INTERVAL_SECONDS,
  LOOKBACK_DAYS,
  MAX_POPUP_ORDERS,
  VISIBLE_SECONDS,
  getPopupSettings,
  updatePopupSettings,
} from "@/lib/api/recentOrderPopup";

const RANGES = {
  lookbackDays: LOOKBACK_DAYS,
  visibleSeconds: VISIBLE_SECONDS,
  intervalSeconds: INTERVAL_SECONDS,
};

/** The no-overlap rule, mirrored from the validator and the CHECK in 036. */
function overlapError(next) {
  if (Number(next.intervalSeconds) <= Number(next.visibleSeconds)) {
    return `Must be longer than the ${next.visibleSeconds} seconds each pop-up stays on screen`;
  }
  return null;
}

/** The timing as a sentence, so the shop can read what the numbers mean. */
function timeline({ visibleSeconds, intervalSeconds }) {
  const visible = Number(visibleSeconds);
  const interval = Number(intervalSeconds);
  if (!Number.isInteger(visible) || !Number.isInteger(interval) || interval <= visible) return null;

  return `First pop-up 5s after a page loads, on screen for ${visible}s, then ${interval - visible}s empty, next pop-up at ${5 + interval}s, and so on. Closing one brings the next 5s later.`;
}

/** A field's own error, checked here before the server is asked. */
function rangeError(name, value) {
  const { min, max } = RANGES[name];
  const number = Number(value);

  if (String(value).trim() === "" || !Number.isInteger(number) || number < min || number > max) {
    return `Enter a whole number from ${min} to ${max}`;
  }

  return null;
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
    if (!fieldErrors.visibleSeconds && !fieldErrors.intervalSeconds) {
      const message = overlapError(next);
      if (message) fieldErrors.intervalSeconds = message;
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

  // The switch saves at once, with the numbers as last saved — flipping it
  // is the one thing this screen is for, and a switch that needs a second
  // click on Save reads as broken.
  async function toggle(enabled) {
    const result = await save({ ...saved, enabled });
    if (result) {
      toast.success(
        enabled ? "Pop-up turned on" : "Pop-up turned off",
        "The storefront picks this up within a minute.",
      );
    }
  }

  async function saveNumbers(event) {
    event.preventDefault();
    const result = await save({ ...form, enabled: saved.enabled });
    if (result) toast.success("Pop-up settings saved");
  }

  const dirty =
    form &&
    saved &&
    (String(form.lookbackDays) !== String(saved.lookbackDays) ||
      String(form.visibleSeconds) !== String(saved.visibleSeconds) ||
      String(form.intervalSeconds) !== String(saved.intervalSeconds));

  const setField = (name) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
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
          description="A small card on the storefront showing a recent order, e.g. “Someone from Chennai just bought Anarkali Set”. Clicking it opens that product."
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
            <div className="flex items-start justify-between gap-4 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">Show the pop-up on the storefront</p>
                <p className="mt-1 text-xs text-ink-500">
                  {saved.enabled
                    ? "On. Shoppers see recent orders on every page except the bag, checkout and their account."
                    : "Off. Shoppers see nothing."}
                </p>
              </div>
              <Toggle
                checked={saved.enabled}
                onChange={toggle}
                disabled={busy}
                label="Show the recent orders pop-up"
              />
            </div>

            <form onSubmit={saveNumbers} className="space-y-4 px-4 py-4 sm:px-5" noValidate>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  label="Look-back window (days)"
                  hint={`Orders paid in the last ${LOOKBACK_DAYS.min}–${LOOKBACK_DAYS.max} days.`}
                  error={errors.lookbackDays}
                >
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={LOOKBACK_DAYS.min}
                    max={LOOKBACK_DAYS.max}
                    step={1}
                    value={form.lookbackDays}
                    onChange={setField("lookbackDays")}
                    invalid={Boolean(errors.lookbackDays)}
                    disabled={busy}
                  />
                </Field>

                <Field
                  label="Each pop-up stays (seconds)"
                  hint={`How long one is on screen, ${VISIBLE_SECONDS.min}–${VISIBLE_SECONDS.max}.`}
                  error={errors.visibleSeconds}
                >
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={VISIBLE_SECONDS.min}
                    max={VISIBLE_SECONDS.max}
                    step={1}
                    value={form.visibleSeconds}
                    onChange={setField("visibleSeconds")}
                    invalid={Boolean(errors.visibleSeconds)}
                    disabled={busy}
                  />
                </Field>

                <Field
                  label="Time between pop-ups (seconds)"
                  hint={`From one appearing to the next. ${INTERVAL_SECONDS.min}–${INTERVAL_SECONDS.max}, and longer than the time each stays.`}
                  error={errors.intervalSeconds}
                >
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={INTERVAL_SECONDS.min}
                    max={INTERVAL_SECONDS.max}
                    step={1}
                    value={form.intervalSeconds}
                    onChange={setField("intervalSeconds")}
                    invalid={Boolean(errors.intervalSeconds)}
                    disabled={busy}
                  />
                </Field>
              </div>

              {timeline(form) ? (
                <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-700 ring-1 ring-inset ring-ink-200">
                  {timeline(form)}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-ink-500">
                  Only paid orders that were not cancelled or refunded, newest first, up to{" "}
                  {MAX_POPUP_ORDERS}. Customer names are never shown, only the delivery city.
                </p>
                <Button type="submit" variant="primary" size="sm" busy={busy} disabled={busy || !dirty}>
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
