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

  const DURATION_RE = /^\d+(ms|s|m|h|d)$/;
  const jwtExpiresIn = (config.JWT_EXPIRES_IN as string) ?? '15m';
  if (!DURATION_RE.test(jwtExpiresIn)) {
    throw new Error(`JWT_EXPIRES_IN must be a duration like 15m/1d; got "${jwtExpiresIn}".`);
  }
  const refreshTtl = (config.REFRESH_TOKEN_TTL as string) ?? '30d';
  if (!DURATION_RE.test(refreshTtl)) {
    throw new Error(`REFRESH_TOKEN_TTL must be a duration like 30d; got "${refreshTtl}".`);
  }

  const mailFrom = (config.MAIL_FROM as string) ?? 'no-reply@swimmingtrace.local';
  const resetTtl = (config.PASSWORD_RESET_TTL as string) ?? '1h';
  if (!DURATION_RE.test(resetTtl)) {
    throw new Error(`PASSWORD_RESET_TTL must be a duration like 1h; got "${resetTtl}".`);
  }
  if (config.SMTP_PORT !== undefined && !/^\d+$/.test(String(config.SMTP_PORT))) {
    throw new Error(`SMTP_PORT must be a number; got "${config.SMTP_PORT}".`);
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    LOG_LEVEL: logLevel,
    PORT: port,
    CORS_ORIGIN: (config.CORS_ORIGIN as string) ?? 'http://localhost:5173',
    SWIMMER_APP_URL: (config.SWIMMER_APP_URL as string) ?? 'http://localhost:5174',
    APP_TIMEZONE: (config.APP_TIMEZONE as string) ?? 'UTC',
    JWT_EXPIRES_IN: jwtExpiresIn,
    REFRESH_TOKEN_TTL: refreshTtl,
    MAIL_FROM: mailFrom,
    PASSWORD_RESET_TTL: resetTtl,
  };
}
