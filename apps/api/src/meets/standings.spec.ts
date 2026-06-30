import { computeStandings, StandingEntry } from './standings';

const meet = new Date('2026-06-30T00:00:00.000Z');
const by = (s: string) => new Date(s + 'T00:00:00.000Z');

function e(over: Partial<StandingEntry>): StandingEntry {
  return { swimmerId: 's', name: 'X', gender: 'MALE', birthDate: by('2012-01-01'), resultTimeMs: 30000, resultStatus: 'OK', ...over };
}

describe('computeStandings', () => {
  it('按 性别×年龄组 分组；组内按时间升序给名次 + 金银铜', () => {
    const g = computeStandings(
      [
        e({ swimmerId: 'a', name: 'A', resultTimeMs: 32000 }),
        e({ swimmerId: 'b', name: 'B', resultTimeMs: 30000 }),
        e({ swimmerId: 'c', name: 'C', resultTimeMs: 31000 }),
      ],
      meet,
    );
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ gender: 'MALE', ageGroup: '13-14' });
    expect(g[0].rows.map((r) => [r.name, r.rank, r.medal])).toEqual([
      ['B', 1, 'gold'],
      ['C', 2, 'silver'],
      ['A', 3, 'bronze'],
    ]);
  });

  it('并列同名次（同时间）', () => {
    const rows = computeStandings(
      [
        e({ name: 'A', resultTimeMs: 30000 }),
        e({ name: 'B', resultTimeMs: 30000 }),
        e({ name: 'C', resultTimeMs: 31000 }),
      ],
      meet,
    )[0].rows;
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(rows.map((r) => r.medal)).toEqual(['gold', 'gold', 'bronze']);
  });

  it('DNS/DNF/DQ 与无成绩不计名次（rank=null，排在后）', () => {
    const rows = computeStandings(
      [
        e({ name: 'A', resultTimeMs: 30000, resultStatus: 'OK' }),
        e({ name: 'B', resultStatus: 'DNS', resultTimeMs: null }),
        e({ name: 'C', resultStatus: 'DQ', resultTimeMs: 29000 }),
      ],
      meet,
    )[0].rows;
    expect(rows.find((r) => r.name === 'A')).toMatchObject({ rank: 1, medal: 'gold' });
    expect(rows.find((r) => r.name === 'B')).toMatchObject({ rank: null });
    expect(rows.find((r) => r.name === 'C')).toMatchObject({ rank: null }); // DQ 即便有时间也不计
  });

  it('男女分组（MALE 在前）', () => {
    const g = computeStandings([e({ gender: 'FEMALE' }), e({ gender: 'MALE' })], meet);
    expect(g.map((x) => x.gender)).toEqual(['MALE', 'FEMALE']);
  });

  it('缺 gender/birthDate 的报名被跳过', () => {
    expect(computeStandings([e({ gender: null }), e({ birthDate: null })], meet)).toEqual([]);
  });
});
