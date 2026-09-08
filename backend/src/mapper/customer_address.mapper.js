// src/mapper/customer_address.mapper.js

/**
 * A saved delivery address (F-05.03, F-08.05).
 *
 * The field names here are the ones checkout already speaks —
 * `postalCode`, not `postal_code`, and the same eight keys the order
 * payload's `shippingAddress` carries. That is the whole point of the
 * shape: the storefront takes a row from this endpoint and sends it
 * back as `shippingAddress` without renaming anything.
 *
 * `customerId` is not returned. Every one of these was fetched with a
 * customer id off a token, so it can only ever be the caller's own, and
 * echoing it back invites a client to start sending it.
 */
export const CustomerAddressMapper = {
  toDTO(row) {
    if (!row) return null;

    return {
      id: row.id,

      label: row.label ?? null,

      line1: row.line1,
      line2: row.line2 ?? null,
      landmark: row.landmark ?? null,
      city: row.city,
      state: row.state,
      postalCode: row.postal_code,
      country: row.country,

      isDefault: row.is_default,

      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  toDTOList(rows = []) {
    return rows.map((row) => CustomerAddressMapper.toDTO(row));
  },
};
