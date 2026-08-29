// src/entities/customer.entity.js

export const customerEntity = {
  tableName: "customers",

  columns: {
    id: {
      type: "UUID",
      primaryKey: true,
      default: "gen_random_uuid()",
      notNull: true,
    },

    name: {
      type: "VARCHAR(255)",
      notNull: true,
    },

    email: {
      type: "VARCHAR(255)",
      notNull: true,
    },

    phone: {
      type: "VARCHAR(20)",
      notNull: true,
    },

    password: {
      type: "CHAR(60)",
      notNull: true,
      select: false,
    },

    deleted_at: {
      type: "TIMESTAMPTZ",
      nullable: true,
    },

    created_at: {
      type: "TIMESTAMPTZ",
      notNull: true,
      default: "NOW()",
    },

    updated_at: {
      type: "TIMESTAMPTZ",
      notNull: true,
      default: "NOW()",
    },
  },

  indexes: [
    {
      name: "customers_email_unique",
      fields: ["email"],
      unique: true,
      where: "deleted_at IS NULL",
    },

    {
      name: "customers_phone_unique",
      fields: ["phone"],
      unique: true,
      where: "deleted_at IS NULL",
    },

    {
      name: "customers_created_at_idx",
      fields: ["created_at"],
    },

    {
      name: "customers_deleted_at_idx",
      fields: ["deleted_at"],
    },
  ],
};
