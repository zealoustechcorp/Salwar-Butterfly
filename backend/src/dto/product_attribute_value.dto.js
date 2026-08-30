export class CreateAttributeValueDTO {
  constructor({ groupName, value, active = true, position = 0 } = {}) {
    this.groupName =
      typeof groupName === "string" ? groupName.trim().toLowerCase() : groupName;
    this.value = typeof value === "string" ? value.trim() : value;
    this.active = active;
    this.position = position;
  }
}

export class UpdateAttributeValueDTO {
  constructor({ value, active, position } = {}) {
    if (value !== undefined)
      this.value = typeof value === "string" ? value.trim() : value;
    if (active !== undefined) this.active = active;
    if (position !== undefined) this.position = position;
  }
}
