// src/repository/recent_order_popup.repository.js
//
// The recent-order pop-up's settings (F-09.09), admin side.
//
// One row, id = 1 (036). The orders the pop-up shows are not read here —
// that is a public read and lives in storefront.repository.js with the
// other columns the world may see.

import { query } from "../config/db.js";
import { logger } from "../utils/logger.js";

const handleDatabaseError = (error, operation) => {
  logger.error(`Recent order popup repository error: ${operation}`, {
    operation,
    code: error?.code,
    constraint: error?.constraint,
    message: error?.message,
  });

  return error;
};

const COLUMNS = `
  enabled,
  lookback_days,
  display_mode,
  visible_seconds,
  interval_seconds,
  close_delay_seconds,
  updated_at
`;

export const RecentOrderPopupRepository = {
  /** The settings row, or null if migration 036 has not been run. */
  async get() {
    try {
      const result = await query(
        `SELECT ${COLUMNS} FROM recent_order_popup_settings WHERE id = 1`,
      );
      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "get");
    }
  },

  /**
   * A full replace of the six settings. An upsert so a database whose
   * seed row was deleted by hand heals itself on the next save.
   */
  async save({ enabled, lookbackDays, displayMode, visibleSeconds, intervalSeconds, closeDelaySeconds }) {
    try {
      const result = await query(
        `INSERT INTO recent_order_popup_settings
           (id, enabled, lookback_days, display_mode, visible_seconds, interval_seconds, close_delay_seconds, updated_at)
         VALUES (1, $1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (id) DO UPDATE SET
           enabled             = EXCLUDED.enabled,
           lookback_days       = EXCLUDED.lookback_days,
           display_mode        = EXCLUDED.display_mode,
           visible_seconds     = EXCLUDED.visible_seconds,
           interval_seconds    = EXCLUDED.interval_seconds,
           close_delay_seconds = EXCLUDED.close_delay_seconds,
           updated_at          = NOW()
         RETURNING ${COLUMNS}`,
        [enabled, lookbackDays, displayMode, visibleSeconds, intervalSeconds, closeDelaySeconds],
      );
      return result.rows[0];
    } catch (error) {
      throw handleDatabaseError(error, "save");
    }
  },
};
