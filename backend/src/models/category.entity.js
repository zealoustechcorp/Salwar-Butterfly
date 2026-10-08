export const categoryEntity = {
  tableName: "categories",

  columns: {
    id: {
      type: "BIGSERIAL",
      primaryKey: true,
      notNull: true,
    },

    name: {
      type: "VARCHAR(255)",
      notNull: true,
      unique: true,
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

    image: {
      type: "VARCHAR(500)",
      nullable: true,
    },

    image_public_id: {
      type: "VARCHAR(255)",
      nullable: true,
    },

    fits: {
      type: "JSONB",
      nullable: true,
      comment: "JSON object containing size fits key-value pairs",
    },

    active: {
      type: "BOOLEAN",
      notNull: true,
      default: true,
    },

    deleted_at: {
      type: "TIMESTAMP",
      nullable: true,
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
      name: "idx_categories_slug",
      fields: ["slug"],
    },
    {
      name: "idx_categories_active",
      fields: ["active"],
    },
    {
      name: "idx_categories_created_at",
      fields: ["created_at"],
    },
    {
      name: "idx_categories_deleted_at",
      fields: ["deleted_at"],
    },
  ],
};
