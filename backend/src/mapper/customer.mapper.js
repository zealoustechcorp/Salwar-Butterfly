// src/mappers/CustomerMapper.js
export class CustomerMapper {
  static toDTO(entity) {
    return {
      id: entity.id,
      name: entity.name,
      email: entity.email,
      phone: entity.phone,
      createdAt: entity.created_at,
      updatedAt: entity.updated_at,
    };
  }

  static toDTOList(entities) {
    return entities.map(CustomerMapper.toDTO);
  }

  static toAuthDTO(entity) {
    return {
      id: entity.id,
      name: entity.name,
      email: entity.email,
      phone: entity.phone,
    };
  }
}
