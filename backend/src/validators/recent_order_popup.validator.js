// src/validators/recent_order_popup.validator.js
//
// The recent-order pop-up's settings (F-09.09). A full replace:
//
//   { enabled, lookbackDays, displayMode, visibleSeconds, gapSeconds }
//
// visibleSeconds is only used in timer mode, but is always sent and kept,
// so switching back to the timer restores what the shop last chose.
//
// Normalised in place, so the service sees booleans and integers only.

import { ApiError } from "../utils/ApiError.js";
import {
  DISPLAY_MODES,
  GAP_SECONDS,
  LOOKBACK_DAYS,
  VISIBLE_SECONDS,
} from "../config/recent_order_popup.policy.js";

const wholeNumberIn = (value, { min, max }) => {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
};

const secondsMessage = ({ min, max }) => `Enter a whole number of seconds from ${min} to ${max}`;

export const validatePopupSettings = (req, res, next) => {
  const body = req.body ?? {};
  const errors = {};

  if (typeof body.enabled !== "boolean") {
    errors.enabled = "Send the switch as true or false";
  }

  const lookbackDays = wholeNumberIn(body.lookbackDays, LOOKBACK_DAYS);
  if (lookbackDays === null) {
    errors.lookbackDays = `Enter a whole number of days from ${LOOKBACK_DAYS.min} to ${LOOKBACK_DAYS.max}`;
  }

  if (!DISPLAY_MODES.includes(body.displayMode)) {
    errors.displayMode = `Choose one of: ${DISPLAY_MODES.join(", ")}`;
  }

  const visibleSeconds = wholeNumberIn(body.visibleSeconds, VISIBLE_SECONDS);
  if (visibleSeconds === null) errors.visibleSeconds = secondsMessage(VISIBLE_SECONDS);

  const gapSeconds = wholeNumberIn(body.gapSeconds, GAP_SECONDS);
  if (gapSeconds === null) errors.gapSeconds = secondsMessage(GAP_SECONDS);

  if (Object.keys(errors).length) {
    throw new ApiError(400, "Validation failed", errors);
  }

  req.body = {
    enabled: body.enabled,
    lookbackDays,
    displayMode: body.displayMode,
    visibleSeconds,
    gapSeconds,
  };

  next();
};
