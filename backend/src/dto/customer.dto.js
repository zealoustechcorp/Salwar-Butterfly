// src/dto/customer.dto.js

// ============================================================
// CREATE CUSTOMER DTO
// ============================================================

export class CreateCustomerDTO {
  constructor(name, email, phone, password) {
    this.name = typeof name === "string" ? name.trim() : name;

    this.email = typeof email === "string" ? email.trim().toLowerCase() : email;

    this.phone = typeof phone === "string" ? phone.trim() : phone;

    this.password = password;
  }
}

// ============================================================
// CUSTOMER LOGIN DTO
// ============================================================

export class LoginCustomerDTO {
  constructor(email, password) {
    this.email = typeof email === "string" ? email.trim().toLowerCase() : email;

    // Never trimmed — leading/trailing whitespace is part of the secret.
    this.password = password;
  }
}

// ============================================================
// UPDATE CUSTOMER DTO
// ============================================================

export class UpdateCustomerDTO {
  constructor(name, email, phone) {
    this.name = typeof name === "string" ? name.trim() : name;

    this.email = typeof email === "string" ? email.trim().toLowerCase() : email;

    this.phone = typeof phone === "string" ? phone.trim() : phone;
  }
}
