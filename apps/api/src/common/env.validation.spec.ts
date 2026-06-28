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

  it('回填 JWT_EXPIRES_IN=15m 与 REFRESH_TOKEN_TTL=30d 默认', () => {
    const out = validateEnv({ ...ok });
    expect(out.JWT_EXPIRES_IN).toBe('15m');
    expect(out.REFRESH_TOKEN_TTL).toBe('30d');
  });

  it('非法时长字符串抛错', () => {
    expect(() => validateEnv({ ...ok, REFRESH_TOKEN_TTL: '30days' })).toThrow(/REFRESH_TOKEN_TTL/);
    expect(() => validateEnv({ ...ok, JWT_EXPIRES_IN: 'abc' })).toThrow(/JWT_EXPIRES_IN/);
  });

  it('回填 MAIL_FROM 与 PASSWORD_RESET_TTL 默认', () => {
    const out = validateEnv({ ...ok });
    expect(out.MAIL_FROM).toBe('no-reply@swimmingtrace.local');
    expect(out.PASSWORD_RESET_TTL).toBe('1h');
  });

  it('非法 PASSWORD_RESET_TTL / SMTP_PORT 抛错', () => {
    expect(() => validateEnv({ ...ok, PASSWORD_RESET_TTL: '1hour' })).toThrow(/PASSWORD_RESET_TTL/);
    expect(() => validateEnv({ ...ok, SMTP_PORT: 'abc' })).toThrow(/SMTP_PORT/);
  });
});
