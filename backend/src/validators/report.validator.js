// src/validators/report.validator.js
//
// Shape checks only. What a period means, how long a range may be and
// which orders count as revenue are decided in ReportService and
// report.policy.js, so a figure reached through any path is reached the
// same way.

import { ApiError } from "../utils/ApiError.js";
import {
  MAX_PAGE_SIZE,
  MAX_TOP_PRODUCTS,
  REPORT_PERIODS,
  TOP_PRODUCTS_SORTS,
} from "../config/report.policy.js";
import { ORDER_STATUSES, PAYMENT_STATUSES } from "../config/order.policy.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const isUuid = (value) => UUID_REGEX.test(String(value ?? "").trim());

/**
 * Both ends of a range, checked together.
 *
 * Together rather than one at a time because the interesting failure is
 * the pair: a `to` before its `from` is two individually valid dates
 * and one impossible range. Reported here so the message names the
 * problem, instead of a query quietly returning nothing.
 */
const checkRange = (query, errors) => {
  const { from, to } = query;

  if (from !== undefined && !ISO_DATE_REGEX.test(String(from))) {
    errors.from = "From must be a date in YYYY-MM-DD form";
  }

  if (to !== undefined && !ISO_DATE_REGEX.test(String(to))) {
    errors.to = "To must be a date in YYYY-MM-DD form";
  }

  if (!errors.from && !errors.to && from && to && String(to) < String(from)) {
    // ISO dates sort lexicographically, which is the whole reason the
    // API takes them in this form rather than as anything friendlier.
    errors.to = "The end of the range cannot fall before its start";
  }
};

const checkPaging = (query, errors) => {
  const { page, limit } = query;

  if (page !== undefined && (!Number.isInteger(Number(page)) || Number(page) < 1)) {
    errors.page = "Page must be a positive whole number";
  }

  if (limit !== undefined) {
    const value = Number(limit);

    if (!Number.isInteger(value) || value < 1) {
      errors.limit = "Limit must be a positive whole number";
    } else if (value > MAX_PAGE_SIZE) {
      errors.limit = `Limit cannot exceed ${MAX_PAGE_SIZE}`;
    }
  }
};

export const validateSalesReportQuery = (req, res, next) => {
  try {
    const { period, topSort, topLimit } = req.query ?? {};

    const errors = {};

    if (period !== undefined && !REPORT_PERIODS.includes(period)) {
      errors.period = `Unknown period. Expected one of: ${REPORT_PERIODS.join(", ")}.`;
    }

    if (topSort !== undefined && !TOP_PRODUCTS_SORTS.includes(topSort)) {
      errors.topSort = `Unknown ranking. Expected one of: ${TOP_PRODUCTS_SORTS.join(", ")}.`;
    }

    if (topLimit !== undefined) {
      const value = Number(topLimit);

      if (!Number.isInteger(value) || value < 1) {
        errors.topLimit = "Top limit must be a positive whole number";
      } else if (value > MAX_TOP_PRODUCTS) {
        errors.topLimit = `Top limit cannot exceed ${MAX_TOP_PRODUCTS}`;
      }
    }

    checkRange(req.query ?? {}, errors);

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const validateOrderReportQuery = (req, res, next) => {
  try {
    const { status, paymentStatus } = req.query ?? {};

    const errors = {};

    if (status !== undefined && !ORDER_STATUSES.includes(status)) {
      errors.status = `Unknown status. Expected one of: ${ORDER_STATUSES.join(", ")}.`;
    }

    if (paymentStatus !== undefined && !PAYMENT_STATUSES.includes(paymentStatus)) {
      errors.paymentStatus = `Unknown payment status. Expected one of: ${PAYMENT_STATUSES.join(", ")}.`;
    }

    checkRange(req.query ?? {}, errors);
    checkPaging(req.query ?? {}, errors);

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const validateInventoryReportQuery = (req, res, next) => {
  try {
    const { categoryId, limit } = req.query ?? {};

    const errors = {};

    if (categoryId !== undefined && !isUuid(categoryId)) {
      errors.categoryId = "Invalid category ID format";
    }

    if (limit !== undefined && (!Number.isInteger(Number(limit)) || Number(limit) < 1)) {
      errors.limit = "Limit must be a positive whole number";
    }

    if (Object.keys(errors).length > 0) {
      throw new ApiError(400, "Validation failed", errors);
    }

    next();
  } catch (error) {
    next(error);
  }
};
