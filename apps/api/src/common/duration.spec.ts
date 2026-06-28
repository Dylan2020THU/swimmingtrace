import { parseDurationMs } from './duration';

describe('parseDurationMs', () => {
  it('解析常见单位', () => {
    expect(parseDurationMs('500ms')).toBe(500);
    expect(parseDurationMs('15m')).toBe(900_000);
    expect(parseDurationMs('30d')).toBe(2_592_000_000);
  });
  it('非法 → 抛错', () => {
    expect(() => parseDurationMs('30days')).toThrow();
    expect(() => parseDurationMs('abc')).toThrow();
  });
});
