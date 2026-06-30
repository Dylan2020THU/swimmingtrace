import { StandingEntry } from './standings';
import { pointsForRank, seasonPoints, SeasonEvent } from './points';

const ref = new Date('2026-01-01T00:00:00.000Z');
// Both swimmers land in MALE 9至14岁 at the reference date.
const mk = (swimmerId: string, name: string, timeMs: number | null, status: StandingEntry['resultStatus'] = 'OK'): StandingEntry => ({
  swimmerId, name, gender: 'MALE', birthDate: new Date('2012-03-01T00:00:00.000Z'),
  resultTimeMs: timeMs, resultStatus: status,
});

describe('pointsForRank', () => {
  it('FINA 式 9-7-6-5-4-3-2-1，第9名起与 null 为 0', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(pointsForRank)).toEqual([9, 7, 6, 5, 4, 3, 2, 1]);
    expect(pointsForRank(9)).toBe(0);
    expect(pointsForRank(20)).toBe(0);
    expect(pointsForRank(null)).toBe(0);
  });
});

describe('seasonPoints', () => {
  it('跨场累计、按 性别×年龄组 分组、组内降序并排名', () => {
    const events: SeasonEvent[] = [
      { entries: [mk('a', 'A', 30000), mk('b', 'B', 31000)] }, // A 1st(9), B 2nd(7)
      { entries: [mk('a', 'A', 30500), mk('b', 'B', 31500)] }, // A 1st(9), B 2nd(7)
    ];
    const groups = seasonPoints(events, ref);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ gender: 'MALE', ageGroup: '9至14岁' });
    expect(groups[0].rows).toEqual([
      { rank: 1, swimmerId: 'a', name: 'A', points: 18 },
      { rank: 2, swimmerId: 'b', name: 'B', points: 14 },
    ]);
  });

  it('同分并列同名次', () => {
    const events: SeasonEvent[] = [
      { entries: [mk('a', 'A', 30000), mk('c', 'C', 31000)] }, // A 9, C 7
      { entries: [mk('c', 'C', 30000), mk('a', 'A', 31000)] }, // C 9, A 7
    ];
    const groups = seasonPoints(events, ref);
    expect(groups[0].rows.map((r) => [r.points, r.rank])).toEqual([
      [16, 1],
      [16, 1],
    ]);
  });

  it('零分（DNS/未上榜）泳者不入榜', () => {
    const events: SeasonEvent[] = [
      { entries: [mk('a', 'A', 30000), mk('d', 'D', null, 'DNS')] }, // A 9, D 0
    ];
    const groups = seasonPoints(events, ref);
    expect(groups[0].rows.map((r) => r.swimmerId)).toEqual(['a']);
  });
});
