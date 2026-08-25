export class ApiError extends Error {
  /**
   * @param {number} statusCode  HTTP status
   * @param {string} message
   * @param {unknown} [details]  optional structured info returned to the client
   */
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}
