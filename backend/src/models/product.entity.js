export const productEntity = {
  tableName: "products",

  columns: {
    id: {
      type: "UUID",
      primaryKey: true,
      notNull: true,
      default: "gen_random_uuid()",
    },

    category_id: {
      type: "UUID",
      notNull: true,
      foreignKey: {
        table: "categories",
        column: "id",
      },
    },

    sub_category_id: {
      type: "UUID",
      nullable: true,
      foreignKey: {
        table: "sub_categories",
        column: "id",
      },
    },

    name: {
      type: "VARCHAR(200)",
      notNull: true,
    },

    slug: {
      type: "VARCHAR(255)",
      notNull: true,
      unique: true,
    },

    description: {
      type: "TEXT",
      nullable: true,
    },

    base_price: {
      type: "DECIMAL(10,2)",
      notNull: true,
    },

    discount_percentage: {
      type: "DECIMAL(5,2)",
      notNull: true,
      default: 0,
    },

    current_price: {
      type: "DECIMAL(10,2)",
      notNull: true,
      default: 0,
    },

    attributes: {
      type: "JSONB",
      notNull: true,
      default: "'{}'::jsonb",
    },

    is_featured: {
      type: "BOOLEAN",
      notNull: true,
      default: false,
    },

    active: {
      type: "BOOLEAN",
      notNull: true,
      default: true,
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

  indexes: [
    { name: "idx_products_slug", fields: ["slug"] },
    { name: "idx_products_category_id", fields: ["category_id"] },
    { name: "idx_products_sub_category_id", fields: ["sub_category_id"] },
    { name: "idx_products_active", fields: ["active"] },
    { name: "idx_products_featured", fields: ["is_featured"] },
    { name: "idx_products_price", fields: ["current_price"] },
    { name: "idx_products_created_at", fields: ["created_at"] },
    { name: "idx_products_attributes", fields: ["attributes"], using: "GIN" },
  ],
};
