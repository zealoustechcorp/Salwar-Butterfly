/**
 * Wraps an async route handler so rejected promises reach the error middleware.
 * (Express 5 does this natively, but the wrapper keeps handlers explicit and
 * works identically if Express is ever downgraded.)
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
