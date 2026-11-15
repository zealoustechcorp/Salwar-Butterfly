// src/validators/recent_order_popup.validator.js
//
// The recent-order pop-up's settings (F-09.09). A full replace:
//
//   { enabled, lookbackDays, visibleSeconds, intervalSeconds }
//
// The gap between pop-ups must be longer than the time each stays up.
//
// Normalised in place, so the service sees booleans and integers only.

import { ApiError } from "../utils/ApiError.js";
import {
  INTERVAL_SECONDS,
  LOOKBACK_DAYS,
  VISIBLE_SECONDS,
} from "../config/recent_order_popup.policy.js";

const wholeNumberIn = (value, { min, max }) => {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
};

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

  const visibleSeconds = wholeNumberIn(body.visibleSeconds, VISIBLE_SECONDS);
  if (visibleSeconds === null) {
    errors.visibleSeconds = `Enter a whole number of seconds from ${VISIBLE_SECONDS.min} to ${VISIBLE_SECONDS.max}`;
  }

  const intervalSeconds = wholeNumberIn(body.intervalSeconds, INTERVAL_SECONDS);
  if (intervalSeconds === null) {
    errors.intervalSeconds = `Enter a whole number of seconds from ${INTERVAL_SECONDS.min} to ${INTERVAL_SECONDS.max}`;
  } else if (visibleSeconds !== null && intervalSeconds <= visibleSeconds) {
    errors.intervalSeconds = `Must be longer than the ${visibleSeconds} seconds each pop-up stays on screen`;
  }

  if (Object.keys(errors).length) {
    throw new ApiError(400, "Validation failed", errors);
  }

  req.body = {
    enabled: body.enabled,
    lookbackDays,
    visibleSeconds,
    intervalSeconds,
  };

  next();
};
