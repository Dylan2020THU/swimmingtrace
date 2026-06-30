import { ageAt, ageGroupOf } from './age-group';

const d = (s: string) => new Date(s + 'T00:00:00.000Z');

describe('ageAt', () => {
  it('生日未到当年减一岁', () => {
    expect(ageAt(d('2014-07-01'), d('2026-06-30'))).toBe(11); // 还没到 7-01
    expect(ageAt(d('2014-06-30'), d('2026-06-30'))).toBe(12); // 正好生日
  });
});

describe('ageGroupOf', () => {
  const meet = d('2026-06-30');
  it('边界落组正确', () => {
    expect(ageGroupOf(d('2017-01-01'), meet)).toBe('10及以下'); // 9 岁
    expect(ageGroupOf(d('2014-01-01'), meet)).toBe('11-12'); // 12 岁
    expect(ageGroupOf(d('2012-01-01'), meet)).toBe('13-14'); // 14 岁
    expect(ageGroupOf(d('2010-01-01'), meet)).toBe('15-17'); // 16 岁
    expect(ageGroupOf(d('2000-01-01'), meet)).toBe('18及以上'); // 26 岁
  });
});
