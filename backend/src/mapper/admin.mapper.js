// src/mapper/admin.mapper.js

export class AdminMapper {
  /**
   * Full representation. Never receives a row containing `password`
   * outside of the auth path, and never emits one regardless.
   */
  static toDTO(entity) {
    return {
      id: entity.id,
      name: entity.name,
      email: entity.email,
      role: entity.role,
      active: entity.active,
      lastLoginAt: entity.last_login_at,
      createdAt: entity.created_at,
      updatedAt: entity.updated_at,
    };
  }

  static toDTOList(entities) {
    return entities.map(AdminMapper.toDTO);
  }

  /**
   * The shape returned by login and /me — the minimum the admin
   * panel needs to render its shell.
   */
  static toAuthDTO(entity) {
    return {
      id: entity.id,
      name: entity.name,
      email: entity.email,
      role: entity.role,
    };
  }
}
