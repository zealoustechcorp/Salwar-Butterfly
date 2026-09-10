export class CreateAttributeValueDTO {
  constructor({ groupName, value, hex = null, active = true, position = 0 } = {}) {
    this.groupName =
      typeof groupName === "string" ? groupName.trim().toLowerCase() : groupName;
    this.value = typeof value === "string" ? value.trim() : value;
    // The swatch, for colours. Null on every other group, and null is
    // also a legitimate colour — one recorded before anyone picked a
    // tone for it, which renders as a name chip rather than a dot.
    this.hex = hex ?? null;
    this.active = active;
    this.position = position;
  }
}

export class UpdateAttributeValueDTO {
  constructor({ value, hex, active, position } = {}) {
    if (value !== undefined)
      this.value = typeof value === "string" ? value.trim() : value;
    // Only `undefined` skips the field: null means "clear the swatch",
    // which is a change the admin can legitimately want to make.
    if (hex !== undefined) this.hex = hex ?? null;
    if (active !== undefined) this.active = active;
    if (position !== undefined) this.position = position;
  }
}
