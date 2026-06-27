/**
 * Boot-time environment validation. Wired into ConfigModule.forRoot({ validate }).
 * Fails fast (throws) on an insecure / missing config so the API never starts
 * with a weak or absent JWT secret.
 */

/** The placeholder secret shipped in .env.example — must never be used to sign real tokens. */
export const WEAK_JWT_SECRET = 'change-me-in-prod';
const MIN_JWT_SECRET_LENGTH = 16;

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

  return config;
}
