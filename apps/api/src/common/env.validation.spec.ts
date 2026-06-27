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

  it('回填默认值（PORT/APP_TIMEZONE/LOG_LEVEL/NODE_ENV/CORS_ORIGIN）', () => {
    const out = validateEnv({ ...ok });
    expect(out.PORT).toBe('3000');
    expect(out.APP_TIMEZONE).toBe('UTC');
    expect(out.LOG_LEVEL).toBe('info');
    expect(out.NODE_ENV).toBe('development');
    expect(out.CORS_ORIGIN).toBe('http://localhost:5173');
  });

  it('保留显式提供的值', () => {
    const out = validateEnv({ ...ok, PORT: '8080', APP_TIMEZONE: 'Asia/Shanghai', NODE_ENV: 'production' });
    expect(out.PORT).toBe('8080');
    expect(out.APP_TIMEZONE).toBe('Asia/Shanghai');
    expect(out.NODE_ENV).toBe('production');
  });

  it('非法 NODE_ENV / LOG_LEVEL / PORT 抛错', () => {
    expect(() => validateEnv({ ...ok, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    expect(() => validateEnv({ ...ok, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
    expect(() => validateEnv({ ...ok, PORT: 'abc' })).toThrow(/PORT/);
  });
});
