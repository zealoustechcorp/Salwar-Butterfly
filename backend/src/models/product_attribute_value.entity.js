export const productAttributeValueEntity = {
  tableName: "product_attribute_values",

  columns: {
    id: {
      type: "UUID",
      primaryKey: true,
      notNull: true,
      default: "gen_random_uuid()",
    },

    group_name: {
      type: "VARCHAR(40)",
      notNull: true,
    },

    value: {
      type: "VARCHAR(100)",
      notNull: true,
    },

    active: {
      type: "BOOLEAN",
      notNull: true,
      default: true,
    },

    position: {
      type: "INTEGER",
      notNull: true,
      default: 0,
    },

    created_at: {
      type: "TIMESTAMP WITH TIME ZONE",
      notNull: true,
      default: "NOW()",
    },

    updated_at: {
      type: "TIMESTAMP WITH TIME ZONE",
      notNull: true,
      default: "NOW()",
    },
  },

  constraints: [
    {
      name: "uq_product_attribute_values_group_value",
      type: "UNIQUE",
      fields: ["group_name", "value"],
    },
  ],

  indexes: [
    {
      name: "idx_product_attribute_values_group",
      fields: ["group_name", "position"],
    },
    { name: "idx_product_attribute_values_active", fields: ["active"] },
  ],
};
