/**
 * Centralised, validated environment config.
 * Values are loaded by `node --env-file=.env` (see package.json scripts).
 */

const required = ['DATABASE_URL'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL,
  pgCaCertPath: process.env.PG_CA_CERT_PATH ?? null,
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
});
