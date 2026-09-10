// src/mapper/size_chart.mapper.js
//
// The shop's published size charts (F-06).
//
// Two shapes, for two readers, and the difference is the point of the
// file.
//
//   toDTO     the admin editor. Carries the id, the print position, the
//             active flag and the timestamps — everything the screen
//             needs to list, reorder and take a chart down.
//
//   toPublic  the storefront. Carries the table and nothing else: no id,
//             no position, no flag, no dates. A shopper reading a size
//             chart has no use for the id of the row it came from, and a
//             public document that carries one invites a client to start
//             sending it back.
//
// Both call the JSONB pair `columns` and `rows`, which is what the
// storefront's chart objects have always been called. The database
// stores them as `column_keys` and `measurements` — see the note in
// 014_create_size_charts.sql for why — and this is where the names go
// back to the ones the tables are actually built from.

/**
 * The JSONB comes out of pg already parsed. Defaulted to an empty array
 * anyway: a row that somehow holds null would otherwise take down the
 * page it is rendered on, and an empty table is a thing the storefront
 * already knows how to skip.
 */
const asArray = (value) => (Array.isArray(value) ? value : []);

export const SizeChartMapper = {
  /** One chart, as the admin screen edits it. */
  toDTO(row) {
    if (!row) return null;

    return {
      id: row.id,

      fit: row.fit,
      title: row.title,
      measures: row.measures,
      unit: row.unit,

      columns: asArray(row.column_keys),
      rows: asArray(row.measurements),

      position: Number(row.position),
      active: Boolean(row.active),

      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  toDTOList(rows = []) {
    return rows.map((row) => SizeChartMapper.toDTO(row));
  },

  /**
   * One chart, as a shopper reads it.
   *
   * The same five fields `lib/sizing.js` has always exported per chart,
   * so the storefront's <SizeChartTables> renders an API chart and a
   * hardcoded fallback with one code path.
   */
  toPublic(row) {
    if (!row) return null;

    return {
      fit: row.fit,
      title: row.title,
      measures: row.measures,
      unit: row.unit,
      columns: asArray(row.column_keys),
      rows: asArray(row.measurements),
    };
  },

  toPublicList(rows = []) {
    return rows.map((row) => SizeChartMapper.toPublic(row));
  },
};
