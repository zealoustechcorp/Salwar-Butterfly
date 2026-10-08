export const subCategoryEntity = {
  tableName: "sub_categories",

  columns: {
    id: {
      type: "UUID",
      primaryKey: true,
      notNull: true,
      default: "gen_random_uuid()",
    },

    name: {
      type: "VARCHAR(255)",
      notNull: true,
    },

    category_id: {
      type: "UUID",
      notNull: true,
      foreignKey: {
        table: "categories",
        column: "id",
      },
    },

    is_active: {
      type: "BOOLEAN",
      notNull: true,
      default: true,
    },

    created_at: {
      type: "TIMESTAMP",
      notNull: true,
      default: "CURRENT_TIMESTAMP",
    },

    updated_at: {
      type: "TIMESTAMP",
      notNull: true,
      default: "CURRENT_TIMESTAMP",
    },
  },

  indexes: [
    {
      name: "idx_sub_categories_category_id",
      fields: ["category_id"],
    },
    {
      name: "idx_sub_categories_is_active",
      fields: ["is_active"],
    },
    {
      name: "idx_sub_categories_created_at",
      fields: ["created_at"],
    },
  ],
};