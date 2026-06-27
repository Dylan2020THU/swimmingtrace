/**
 * Boot-time environment validation. Wired into ConfigModule.forRoot({ validate }).
 * Fails fast (throws) on an insecure / missing config so the API never starts
 * with a weak or absent JWT secret.
 */

/** The placeholder secret shipped in .env.example — must never be used to sign real tokens. */
export const WEAK_JWT_SECRET = 'change-me-in-prod';
const MIN_JWT_SECRET_LENGTH = 16;
const NODE_ENVS = ['development', 'test', 'production'];
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const secret = config.JWT_SECRET;

  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('JWT_SECRET is required but is missing. Set a strong random secret before starting the API.');
  }
  if (secret === WEAK_JWT_SECRET) {
    throw new Error(`JWT_SECRET is set to the insecure placeholder "${WEAK_JWT_SECRET}". Set a strong random secret.`);
  }
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET is too short (${secret.length} chars); require at least ${MIN_JWT_SECRET_LENGTH}.`);
  }

  if (typeof config.DATABASE_URL !== 'string' || config.DATABASE_URL.length === 0) {
    throw new Error('DATABASE_URL is required but is missing.');
  }

  const nodeEnv = (config.NODE_ENV as string) ?? 'development';
  if (!NODE_ENVS.includes(nodeEnv)) {
    throw new Error(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}; got "${nodeEnv}".`);
  }
  const logLevel = (config.LOG_LEVEL as string) ?? 'info';
  if (!LOG_LEVELS.includes(logLevel)) {
    throw new Error(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}; got "${logLevel}".`);
  }
  const port = String((config.PORT as string) ?? '3000');
  if (!/^\d+$/.test(port)) {
    throw new Error(`PORT must be a positive integer; got "${port}".`);
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    LOG_LEVEL: logLevel,
    PORT: port,
    CORS_ORIGIN: (config.CORS_ORIGIN as string) ?? 'http://localhost:5173',
    SWIMMER_APP_URL: (config.SWIMMER_APP_URL as string) ?? 'http://localhost:5174',
    APP_TIMEZONE: (config.APP_TIMEZONE as string) ?? 'UTC',
  };
}
