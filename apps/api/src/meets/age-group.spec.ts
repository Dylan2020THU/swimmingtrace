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
  it('各年龄段落组正确', () => {
    expect(ageGroupOf(d('2019-01-01'), meet)).toBe('6至8岁'); // 7 岁
    expect(ageGroupOf(d('2012-01-01'), meet)).toBe('9至14岁'); // 14 岁
    expect(ageGroupOf(d('2009-01-01'), meet)).toBe('15至18岁'); // 17 岁
    expect(ageGroupOf(d('2000-01-01'), meet)).toBe('19至35岁'); // 26 岁
    expect(ageGroupOf(d('1985-01-01'), meet)).toBe('36至45岁'); // 41 岁
    expect(ageGroupOf(d('1975-01-01'), meet)).toBe('46至55岁'); // 51 岁
    expect(ageGroupOf(d('1965-01-01'), meet)).toBe('56至69岁'); // 61 岁
    expect(ageGroupOf(d('1950-01-01'), meet)).toBe('70岁以上'); // 76 岁
  });
  it('边界与低于最小段', () => {
    expect(ageGroupOf(d('2020-06-30'), meet)).toBe('6至8岁'); // 6 岁（下边界）
    expect(ageGroupOf(d('2018-06-30'), meet)).toBe('6至8岁'); // 8 岁（上边界）
    expect(ageGroupOf(d('2017-06-30'), meet)).toBe('9至14岁'); // 9 岁（跨界）
    expect(ageGroupOf(d('2023-01-01'), meet)).toBe('6至8岁'); // 3 岁 → 低于最小段，钳到最年轻
  });
});
