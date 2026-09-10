// src/validators/size_chart.validator.js
//
// The shop's published size charts (F-06). Shape checks only.
//
// The field rules come from size_chart.rules.js, which quotes
// config/size_chart.policy.js. Nothing here decides what a chart may
// contain; it decides what a request looks like.

import { ApiError } from "../utils/ApiError.js";
import {
  validateActive,
  validateSizeChartFields,
} from "./size_chart.rules.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const validateSizeChartIdParam = (req, res, next) => {
  const id = String(req.params?.id ?? "").trim();

  if (!UUID_REGEX.test(id)) {
    throw new ApiError(400, "Invalid size chart ID format");
  }

  req.params.id = id;

  next();
};

/**
 * The body of a create or a replace.
 *
 * Both send the whole chart — see the repository for why the update is a
 * replace rather than a patch — so one middleware serves both.
 */
export const validateSizeChartBody = (req, res, next) => {
  const errors = validateSizeChartFields(req.body ?? {});

  if (Object.keys(errors).length) {
    throw new ApiError(400, "Validation failed", errors);
  }

  next();
};

/** The toggle in the admin row: `{ active: boolean }`, and nothing else. */
export const validateSetActive = (req, res, next) => {
  const problem = validateActive(req.body?.active);

  if (problem || req.body?.active === undefined) {
    throw new ApiError(400, "Validation failed", {
      active: problem ?? "Active is required",
    });
  }

  next();
};

/**
 * A reorder: `{ ids: [...] }`, in the order the shop wants them printed.
 *
 * Every id is required to be a UUID here; that it is the *complete* set
 * of charts is the service's check, because only the service can see how
 * many there are. Sending a partial list would silently renumber the
 * ones named and leave the rest sharing positions with them.
 */
export const validateReorder = (req, res, next) => {
  const ids = req.body?.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(400, "Validation failed", {
      ids: "Send the chart ids in the order they should be printed",
    });
  }

  const seen = new Set();

  for (const id of ids) {
    if (typeof id !== "string" || !UUID_REGEX.test(id.trim())) {
      throw new ApiError(400, "Validation failed", {
        ids: `'${id}' is not a valid size chart ID`,
      });
    }

    if (seen.has(id.trim())) {
      throw new ApiError(400, "Validation failed", {
        ids: "The same chart is listed twice",
      });
    }

    seen.add(id.trim());
  }

  req.body.ids = ids.map((id) => id.trim());

  next();
};
