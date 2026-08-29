// src/utils/apiResponse.js

// ============================================================
// SUCCESS RESPONSE
// ============================================================

export const successResponse = ({
  res,
  statusCode = 200,
  data = null,
  message = "Success",
  meta = undefined,
}) => {
  const response = {
    success: true,
    message,
    data,
  };

  if (meta !== undefined) {
    response.meta = meta;
  }

  return res.status(statusCode).json(response);
};

// ============================================================
// 200 OK
// ============================================================

export const okResponse = ({
  res,
  data = null,
  message = "Request successful",
  meta = undefined,
}) => {
  return successResponse({
    res,
    statusCode: 200,
    data,
    message,
    meta,
  });
};

// ============================================================
// 201 CREATED
// ============================================================

export const createdResponse = ({
  res,
  data = null,
  message = "Resource created successfully",
  meta = undefined,
}) => {
  return successResponse({
    res,
    statusCode: 201,
    data,
    message,
    meta,
  });
};

// ============================================================
// 202 ACCEPTED
// ============================================================

export const acceptedResponse = ({
  res,
  data = null,
  message = "Request accepted for processing",
  meta = undefined,
}) => {
  return successResponse({
    res,
    statusCode: 202,
    data,
    message,
    meta,
  });
};

// ============================================================
// 204 NO CONTENT
// ============================================================

export const noContentResponse = (res) => {
  return res.status(204).send();
};

// ============================================================
// PAGINATED RESPONSE
// ============================================================

export const paginatedResponse = ({
  res,
  data = [],
  page,
  limit,
  total,
  message = "Resources retrieved successfully",
}) => {
  const currentPage = Number(page);
  const currentLimit = Number(limit);
  const totalRecords = Number(total);

  const totalPages =
    currentLimit > 0 ? Math.ceil(totalRecords / currentLimit) : 0;

  return res.status(200).json({
    success: true,
    message,
    data,
    meta: {
      pagination: {
        page: currentPage,
        limit: currentLimit,
        total: totalRecords,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
      },
    },
  });
};
