import { validateEnv, WEAK_JWT_SECRET } from './env.validation';

const ok = { JWT_SECRET: 'a-strong-secret-0123456789', DATABASE_URL: 'postgresql://x' };

describe('validateEnv', () => {
  it('passes with a strong secret + database url', () => {
    expect(validateEnv({ ...ok })).toMatchObject(ok);
  });

  it('throws when JWT_SECRET is missing', () => {
    expect(() => validateEnv({ DATABASE_URL: 'postgresql://x' })).toThrow(/JWT_SECRET is required/);
  });

  it('throws when JWT_SECRET is the insecure placeholder', () => {
    expect(() => validateEnv({ ...ok, JWT_SECRET: WEAK_JWT_SECRET })).toThrow(/insecure placeholder/);
  });

  it('throws when JWT_SECRET is too short', () => {
    expect(() => validateEnv({ ...ok, JWT_SECRET: 'short' })).toThrow(/too short/);
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => validateEnv({ JWT_SECRET: 'a-strong-secret-0123456789' })).toThrow(/DATABASE_URL is required/);
  });
});
