// src/utils/ApiError.js

// ============================================================
// PRODUCTION-GRADE API ERROR
// ============================================================

// ============================================================
// DEFAULT CODE PER STATUS
// ============================================================
//
// Used by the positional signature, which has no code argument.
//

const CODE_BY_STATUS = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "RESOURCE_NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE_ENTITY",
  429: "TOO_MANY_REQUESTS",
  500: "INTERNAL_SERVER_ERROR",
};

// ============================================================
// ARGUMENT NORMALIZATION
// ============================================================
//
// Two call styles are supported:
//
//   new ApiError({ statusCode, message, code, errors })
//   new ApiError(statusCode, message, errors)
//
// The positional form is what the controllers, services and
// validators use throughout. Without it the number lands in the
// destructuring pattern, every field falls back to its default,
// and a 400 with field errors is served as a bare 500.
//

const normalizeArgs = (first, message, errors) => {
  if (typeof first !== "number") {
    return first ?? {};
  }

  return {
    statusCode: first,
    message,
    code: CODE_BY_STATUS[first] ?? `HTTP_${first}`,
    errors,
  };
};

export class ApiError extends Error {
  constructor(first, positionalMessage, positionalErrors) {
    const {
      statusCode = 500,
      message = "Internal Server Error",
      code = "INTERNAL_SERVER_ERROR",
      details = null,
      errors = null,
      isOperational = true,
      cause = null,
    } = normalizeArgs(first, positionalMessage, positionalErrors);

    super(message);

    // ----------------------------------------------------------
    // BASIC ERROR INFORMATION
    // ----------------------------------------------------------

    this.name = "ApiError";

    this.statusCode = Number(statusCode) || 500;

    this.message = message || "Internal Server Error";

    // ----------------------------------------------------------
    // APPLICATION ERROR CODE
    // ----------------------------------------------------------
    //
    // Example:
    //
    // PRODUCT_NOT_FOUND
    // CATEGORY_NOT_FOUND
    // VALIDATION_ERROR
    // PRODUCT_SLUG_EXISTS
    //
    // ----------------------------------------------------------

    this.code = code || "INTERNAL_SERVER_ERROR";

    // ----------------------------------------------------------
    // ADDITIONAL DETAILS
    // ----------------------------------------------------------

    this.details = details ?? null;

    // ----------------------------------------------------------
    // VALIDATION ERRORS
    // ----------------------------------------------------------
    //
    // Example:
    //
    // errors: {
    //   name: "Product name is required",
    //   basePrice: "Base price must be a valid number"
    // }
    //
    // ----------------------------------------------------------

    this.errors = errors ?? null;

    // ----------------------------------------------------------
    // OPERATIONAL ERROR
    // ----------------------------------------------------------
    //
    // true  = expected application error
    // false = unexpected programming/system error
    //
    // ----------------------------------------------------------

    this.isOperational = Boolean(isOperational);

    // ----------------------------------------------------------
    // TIMESTAMP
    // ----------------------------------------------------------

    this.timestamp = new Date().toISOString();

    // ----------------------------------------------------------
    // ERROR CAUSE
    // ----------------------------------------------------------
    //
    // Useful for Node.js Error.cause support.
    //
    // ----------------------------------------------------------

    if (cause) {
      this.cause = cause;
    }

    // ----------------------------------------------------------
    // STACK TRACE
    // ----------------------------------------------------------

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  // ==========================================================
  // JSON SERIALIZATION
  // ==========================================================

  toJSON() {
    const response = {
      success: false,
      statusCode: this.statusCode,
      code: this.code,
      message: this.message,
    };

    // --------------------------------------------------------
    // DETAILS
    // --------------------------------------------------------

    if (this.details !== null && this.details !== undefined) {
      response.details = this.details;
    }

    // --------------------------------------------------------
    // VALIDATION ERRORS
    // --------------------------------------------------------

    if (this.errors !== null && this.errors !== undefined) {
      response.errors = this.errors;
    }

    // --------------------------------------------------------
    // TIMESTAMP
    // --------------------------------------------------------

    response.timestamp = this.timestamp;

    return response;
  }

  // ==========================================================
  // STATIC FACTORY METHODS
  // ==========================================================

  static badRequest(
    message = "Bad Request",
    code = "BAD_REQUEST",
    details = null,
    errors = null,
  ) {
    return new ApiError({
      statusCode: 400,
      message,
      code,
      details,
      errors,
    });
  }

  static unauthorized(
    message = "Authentication required",
    code = "UNAUTHORIZED",
    details = null,
  ) {
    return new ApiError({
      statusCode: 401,
      message,
      code,
      details,
    });
  }

  static forbidden(
    message = "You do not have permission to perform this action",
    code = "FORBIDDEN",
    details = null,
  ) {
    return new ApiError({
      statusCode: 403,
      message,
      code,
      details,
    });
  }

  static notFound(
    message = "Resource not found",
    code = "RESOURCE_NOT_FOUND",
    details = null,
  ) {
    return new ApiError({
      statusCode: 404,
      message,
      code,
      details,
    });
  }

  static conflict(
    message = "Resource already exists",
    code = "CONFLICT",
    details = null,
  ) {
    return new ApiError({
      statusCode: 409,
      message,
      code,
      details,
    });
  }

  static unprocessableEntity(
    message = "Request could not be processed",
    code = "UNPROCESSABLE_ENTITY",
    details = null,
    errors = null,
  ) {
    return new ApiError({
      statusCode: 422,
      message,
      code,
      details,
      errors,
    });
  }

  static tooManyRequests(
    message = "Too many requests",
    code = "TOO_MANY_REQUESTS",
    details = null,
  ) {
    return new ApiError({
      statusCode: 429,
      message,
      code,
      details,
    });
  }

  static internal(
    message = "Internal Server Error",
    code = "INTERNAL_SERVER_ERROR",
    details = null,
    cause = null,
  ) {
    return new ApiError({
      statusCode: 500,
      message,
      code,
      details,
      cause,
      isOperational: false,
    });
  }

  static notImplemented(
    message = "This feature is not implemented",
    code = "NOT_IMPLEMENTED",
    details = null,
  ) {
    return new ApiError({
      statusCode: 501,
      message,
      code,
      details,
    });
  }

  static badGateway(
    message = "Bad Gateway",
    code = "BAD_GATEWAY",
    details = null,
  ) {
    return new ApiError({
      statusCode: 502,
      message,
      code,
      details,
    });
  }

  static serviceUnavailable(
    message = "Service temporarily unavailable",
    code = "SERVICE_UNAVAILABLE",
    details = null,
  ) {
    return new ApiError({
      statusCode: 503,
      message,
      code,
      details,
    });
  }

  static gatewayTimeout(
    message = "Gateway Timeout",
    code = "GATEWAY_TIMEOUT",
    details = null,
  ) {
    return new ApiError({
      statusCode: 504,
      message,
      code,
      details,
    });
  }
}
