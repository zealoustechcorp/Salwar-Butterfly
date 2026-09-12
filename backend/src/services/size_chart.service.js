// src/services/size_chart.service.js
//
// The shop's published size charts (F-06).
//
// Two audiences out of one table. The admin gets every chart with its id
// and its flags; the storefront gets the active ones as bare tables. The
// split is enforced by which mapper each path calls, not by a filter
// downstream — see size_chart.mapper.js.
//
// The one rule worth stating up front: a chart is stored exactly as the
// shop typed it, apart from trimming and rounding. Nothing here derives
// a missing measurement from its neighbours or fills a gap with an
// average. These numbers are printed beside a Buy button, and a
// plausible invented figure is worse than a dash.

import { SizeChartRepository } from "../repository/size_chart.repository.js";
import { SizeChartMapper } from "../mapper/size_chart.mapper.js";
import {
  DEFAULT_UNIT,
  roundMeasurement,
} from "../config/size_chart.policy.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const assertUuid = (value, label = "size chart ID") => {
  const id = String(value ?? "").trim();

  if (!UUID_RE.test(id)) {
    throw ApiError.badRequest(`Invalid ${label}`, "INVALID_UUID");
  }

  return id;
};

/**
 * One row of the table, rebuilt from the chart's own columns.
 *
 * Built key by key rather than spread from the request, so a chart can
 * never store a measurement it does not have a column for. The validator
 * already refuses those, and this makes it structurally impossible as
 * well — the two together are why the JSONB can be trusted by everything
 * that reads it.
 *
 * A blank cell is stored as null and printed as a dash. Zero would be a
 * measurement.
 */
const toRow = (row, columns) => {
  const out = { size: String(row.size).trim() };

  for (const column of columns.slice(1)) {
    const value = row[column];

    out[column] =
      value === null || value === undefined || value === ""
        ? null
        : roundMeasurement(value);
  }

  return out;
};

/**
 * The chart as it will be written.
 *
 * Shape only — every field was checked by size_chart.validator.js before
 * this ran. What this adds is the defaulting and the normalising, and
 * the `fallback` argument is what makes an edit that omits `position` or
 * `active` keep what the chart already had rather than silently moving
 * it to the front of the tabs or publishing it again.
 */
const toChart = (body, fallback) => {
  const columns = body.columns;

  return {
    fit: String(body.fit).trim(),
    title: String(body.title).trim(),
    unit: body.unit ?? fallback.unit ?? DEFAULT_UNIT,
    columns,
    rows: body.rows.map((row) => toRow(row, columns)),
    position:
      body.position === undefined || body.position === null || body.position === ""
        ? fallback.position
        : Number(body.position),
    active: body.active === undefined ? fallback.active : Boolean(body.active),
  };
};

export const SizeChartService = {
  // ==========================================================
  // READS
  // ==========================================================

  /** Every chart, published or not — the admin screen's list. */
  async getAll() {
    try {
      const rows = await SizeChartRepository.list();

      return SizeChartMapper.toDTOList(rows);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("SizeChartService.getAll failed", { error: error?.message });

      throw new ApiError(500, "Failed to load the size charts");
    }
  },

  /**
   * The charts a shopper may read, in the order the shop prints them.
   *
   * An empty list is a real answer and not an error: it means the shop
   * has taken every chart down, and the storefront renders no size-chart
   * button at all rather than falling back to something it made up.
   */
  async getPublished() {
    try {
      const rows = await SizeChartRepository.listActive();

      return SizeChartMapper.toPublicList(rows);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("SizeChartService.getPublished failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to load the size charts");
    }
  },

  async getById(chartId) {
    const id = assertUuid(chartId);

    try {
      const row = await SizeChartRepository.findById(id);

      if (!row) {
        throw ApiError.notFound("Size chart not found", "SIZE_CHART_NOT_FOUND");
      }

      return SizeChartMapper.toDTO(row);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("SizeChartService.getById failed", {
        chartId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to load the size chart");
    }
  },

  // ==========================================================
  // WRITES
  // ==========================================================

  /**
   * Publishes a new fit.
   *
   * The duplicate check is case-insensitive and happens here rather than
   * being left to the UNIQUE index, because the index cannot say "you
   * already have a Slim Fit chart" — it can only say 23505, which
   * reaches the shop as "something went wrong".
   */
  async create(body) {
    try {
      const clash = await SizeChartRepository.findByFit(String(body.fit).trim());

      if (clash) {
        throw ApiError.conflict(
          `There is already a chart for '${clash.fit}'. Edit that one instead.`,
          "SIZE_CHART_FIT_EXISTS",
        );
      }

      const position = await SizeChartRepository.nextPosition();

      const row = await SizeChartRepository.create(
        toChart(body, { position, active: true }),
      );

      logger.info("Size chart created", { id: row.id, fit: row.fit });

      return SizeChartMapper.toDTO(row);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      // 23505: the UNIQUE on fit, reached by two admins saving the same
      // new fit at once. The check above lost the race; the index did
      // not, and the shop gets the same sentence either way.
      if (error?.code === "23505") {
        throw ApiError.conflict(
          "There is already a chart for that fit",
          "SIZE_CHART_FIT_EXISTS",
        );
      }

      logger.error("SizeChartService.create failed", { error: error?.message });

      throw new ApiError(500, "Failed to save the size chart");
    }
  },

  /**
   * Replaces a chart.
   *
   * `position` and `active` are optional and default to what the chart
   * already is: correcting a hip measurement should not move the tab or
   * republish a chart the shop had taken down.
   */
  async update(chartId, body) {
    const id = assertUuid(chartId);

    try {
      const existing = await SizeChartRepository.findById(id);

      if (!existing) {
        throw ApiError.notFound("Size chart not found", "SIZE_CHART_NOT_FOUND");
      }

      const clash = await SizeChartRepository.findByFit(
        String(body.fit).trim(),
        id,
      );

      if (clash) {
        throw ApiError.conflict(
          `There is already a chart for '${clash.fit}'.`,
          "SIZE_CHART_FIT_EXISTS",
        );
      }

      const row = await SizeChartRepository.update(
        id,
        toChart(body, {
          unit: existing.unit,
          position: Number(existing.position),
          active: Boolean(existing.active),
        }),
      );

      if (!row) {
        throw ApiError.notFound("Size chart not found", "SIZE_CHART_NOT_FOUND");
      }

      logger.info("Size chart updated", { id, fit: row.fit });

      return SizeChartMapper.toDTO(row);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      if (error?.code === "23505") {
        throw ApiError.conflict(
          "There is already a chart for that fit",
          "SIZE_CHART_FIT_EXISTS",
        );
      }

      logger.error("SizeChartService.update failed", {
        chartId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update the size chart");
    }
  },

  /** Takes a chart off the storefront, or puts it back. */
  async setActive(chartId, active) {
    const id = assertUuid(chartId);

    try {
      const row = await SizeChartRepository.setActive(id, Boolean(active));

      if (!row) {
        throw ApiError.notFound("Size chart not found", "SIZE_CHART_NOT_FOUND");
      }

      logger.info("Size chart visibility changed", {
        id,
        fit: row.fit,
        active: row.active,
      });

      return SizeChartMapper.toDTO(row);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("SizeChartService.setActive failed", {
        chartId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update the size chart");
    }
  },

  /**
   * Rewrites the order the charts are printed in.
   *
   * The whole set must be sent. A partial list would renumber the charts
   * it names from 1 and leave the others where they were, which is not a
   * reorder — it is two charts at position 2 and an order that settles
   * alphabetically. The ids are checked against what is actually in the
   * table so a stale screen cannot half-apply an order built before
   * somebody else added a fit.
   */
  async reorder(ids) {
    try {
      const existing = await SizeChartRepository.list();
      const known = new Set(existing.map((row) => row.id));

      if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
        throw ApiError.badRequest(
          "Send every chart, in the order they should be printed. " +
            "The list of charts has changed since this screen loaded.",
          "SIZE_CHART_ORDER_INCOMPLETE",
        );
      }

      const rows = await SizeChartRepository.reorder(ids);

      logger.info("Size charts reordered", { count: ids.length });

      return SizeChartMapper.toDTOList(rows);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("SizeChartService.reorder failed", { error: error?.message });

      throw new ApiError(500, "Failed to reorder the size charts");
    }
  },

  /**
   * Deletes a chart outright.
   *
   * There is no undo. Hiding is what `setActive` is for, and it is the
   * gesture the admin table offers first.
   */
  async remove(chartId) {
    const id = assertUuid(chartId);

    try {
      const removed = await SizeChartRepository.remove(id);

      if (!removed) {
        throw ApiError.notFound("Size chart not found", "SIZE_CHART_NOT_FOUND");
      }

      logger.info("Size chart deleted", { id });

      return SizeChartService.getAll();
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("SizeChartService.remove failed", {
        chartId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to delete the size chart");
    }
  },
};
