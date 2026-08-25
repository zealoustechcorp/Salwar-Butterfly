import { env } from '../config/env.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  const status = err.statusCode ?? err.status ?? 500;

  if (status >= 500) {
    console.error('[error]', err);
  }

  res.status(status).json({
    status: 'error',
    message: status >= 500 && env.isProd ? 'Internal server error' : err.message,
    ...(err.details ? { details: err.details } : {}),
    ...(!env.isProd && status >= 500 && err.stack ? { stack: err.stack } : {}),
  });
}
