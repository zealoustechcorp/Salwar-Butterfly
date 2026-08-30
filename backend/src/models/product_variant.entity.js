export const productVariantEntity = {
  tableName: "product_variants",

  columns: {
    id: {
      type: "UUID",
      primaryKey: true,
      notNull: true,
      default: "gen_random_uuid()",
    },

    product_id: {
      type: "UUID",
      notNull: true,
      foreignKey: {
        table: "products",
        column: "id",
        onDelete: "CASCADE",
      },
    },

    size: {
      type: "VARCHAR(20)",
      notNull: true,
    },

    stock_quantity: {
      type: "INTEGER",
      notNull: true,
      default: 0,
      check: "stock_quantity >= 0",
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
      name: "uq_product_variants_product_size",
      type: "UNIQUE",
      fields: ["product_id", "size"],
    },
  ],

  indexes: [
    { name: "idx_product_variants_product", fields: ["product_id"] },
    { name: "idx_product_variants_active", fields: ["active"] },
    { name: "idx_product_variants_stock", fields: ["stock_quantity"] },
    { name: "idx_product_variants_position", fields: ["product_id", "position"] },
  ],
};
