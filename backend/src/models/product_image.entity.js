export const productImageEntity = {
  tableName: "product_images",

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
      references: { table: "products", column: "id", onDelete: "CASCADE" },
    },

    image_url: {
      type: "TEXT",
      notNull: true,
    },

    image_public_id: {
      type: "TEXT",
      notNull: true,
    },

    alt_text: {
      type: "VARCHAR(200)",
      notNull: false,
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
      name: "uq_product_images_public_id",
      type: "UNIQUE",
      fields: ["image_public_id"],
    },
  ],

  indexes: [
    {
      name: "idx_product_images_product_position",
      fields: ["product_id", "position"],
    },
  ],
};
