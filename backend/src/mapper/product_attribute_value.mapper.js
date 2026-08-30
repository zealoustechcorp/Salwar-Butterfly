export const AttributeValueMapper = {
  toDTO(row) {
    if (!row) return null;

    return {
      id: row.id,
      groupName: row.group_name,
      value: row.value,
      active: row.active,
      position: Number(row.position ?? 0),
      // Present only on the listing queries, which count how many
      // products currently carry this value. Lets the admin see what a
      // rename or a delete would affect before doing it.
      usageCount:
        row.usage_count === undefined ? undefined : Number(row.usage_count),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  toDTOList(rows = []) {
    return rows.map((row) => AttributeValueMapper.toDTO(row));
  },

  /**
   * The register keyed by group — the shape both the attributes screen
   * and the product form's dropdowns consume.
   */
  toGroups(rows = []) {
    const groups = {};

    for (const row of rows) {
      (groups[row.group_name] ||= []).push(AttributeValueMapper.toDTO(row));
    }

    return groups;
  },
};
