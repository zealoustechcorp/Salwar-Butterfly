// src/dto/admin.dto.js

// ============================================================
// ADMIN LOGIN DTO
// ============================================================

export class LoginAdminDTO {
  constructor(email, password) {
    this.email = typeof email === "string" ? email.trim().toLowerCase() : email;

    // Never trimmed — leading/trailing whitespace is part of the secret.
    this.password = password;
  }
}

// ============================================================
// CREATE ADMIN DTO
// ============================================================

export class CreateAdminDTO {
  constructor(name, email, password, role) {
    this.name = typeof name === "string" ? name.trim() : name;

    this.email = typeof email === "string" ? email.trim().toLowerCase() : email;

    this.password = password;

    this.role = typeof role === "string" ? role.trim().toLowerCase() : role;
  }
}
