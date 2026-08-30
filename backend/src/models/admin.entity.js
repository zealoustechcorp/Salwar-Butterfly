// src/models/admin.entity.js

/**
 * Descriptive metadata for the `admins` table.
 *
 * Like the other *.entity.js files this is documentation, not an
 * ORM — AdminRepository writes the SQL by hand. Keep it in sync
 * with src/migrations/002_create_admins.sql.
 */

export const ADMIN_ROLES = Object.freeze({
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
});

export const adminEntity = {
  tableName: "admins",

  columns: {
    id: {
      type: "UUID",
      primaryKey: true,
      default: "gen_random_uuid()",
      notNull: true,
    },

    name: { type: "VARCHAR(255)", notNull: true },

    email: { type: "VARCHAR(255)", notNull: true },

    // bcrypt hash — never selected outside findByEmailForAuth()
    password: { type: "CHAR(60)", notNull: true, select: false },

    role: {
      type: "VARCHAR(32)",
      notNull: true,
      default: "'admin'",
      enum: Object.values(ADMIN_ROLES),
    },

    active: { type: "BOOLEAN", notNull: true, default: "TRUE" },

    last_login_at: { type: "TIMESTAMPTZ", nullable: true },

    deleted_at: { type: "TIMESTAMPTZ", nullable: true },

    created_at: { type: "TIMESTAMPTZ", notNull: true, default: "NOW()" },

    updated_at: { type: "TIMESTAMPTZ", notNull: true, default: "NOW()" },
  },

  indexes: [
    {
      name: "admins_email_unique",
      fields: ["email"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "admins_created_at_idx", fields: ["created_at"] },
    { name: "admins_deleted_at_idx", fields: ["deleted_at"] },
  ],
};
