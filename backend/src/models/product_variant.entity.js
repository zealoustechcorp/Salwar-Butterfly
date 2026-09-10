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

    // The empty string means "not sold by colour", not "colour unknown".
    // NULL would break the unique constraint below — NULLs are distinct
    // from one another, so two colourless rows for the same size would
    // both be accepted. See migration 015.
    colour: {
      type: "VARCHAR(40)",
      notNull: true,
      default: "''",
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
      name: "uq_product_variants_product_size_colour",
      type: "UNIQUE",
      fields: ["product_id", "size", "colour"],
    },
  ],

  indexes: [
    { name: "idx_product_variants_product", fields: ["product_id"] },
    { name: "idx_product_variants_product_colour", fields: ["product_id", "colour"] },
    { name: "idx_product_variants_active", fields: ["active"] },
    { name: "idx_product_variants_stock", fields: ["stock_quantity"] },
    { name: "idx_product_variants_position", fields: ["product_id", "position"] },
  ],
};
