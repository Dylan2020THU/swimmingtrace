import { Gender, ResultStatus, Stroke } from '@swim/shared';
import { clubRecords, personalBests, RecordEntry } from './records';

const mk = (
  over: Partial<RecordEntry> & Pick<RecordEntry, 'swimmerId' | 'resultTimeMs'>,
): RecordEntry => ({
  ownerId: 'o1', name: over.swimmerId.toUpperCase(),
  gender: 'MALE' as Gender, birthDate: new Date('2012-03-01T00:00:00.000Z'),
  distanceMeters: 50, stroke: 'FREE' as Stroke,
  resultStatus: 'OK' as ResultStatus, meetName: 'M', meetDate: new Date('2026-06-01T00:00:00.000Z'),
  ...over,
});

describe('clubRecords', () => {
  it('每 (距离×泳姿×性别×年龄组) 取最快 OK；排除 DNS/缺资料', () => {
    const recs = clubRecords([
      mk({ swimmerId: 'a', resultTimeMs: 30000 }),
      mk({ swimmerId: 'b', resultTimeMs: 31000 }), // 同组更慢
      mk({ swimmerId: 'c', resultTimeMs: 32000, gender: 'FEMALE' }), // 女子组
      mk({ swimmerId: 'd', resultTimeMs: null, resultStatus: 'DNS' }), // 排除
      mk({ swimmerId: 'e', resultTimeMs: 29000, gender: null }), // 无法分组 → 排除
    ]);
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({ gender: 'MALE', ageGroup: '13-14', distanceMeters: 50, stroke: 'FREE', swimmerId: 'a', timeMs: 30000 });
    expect(recs[1]).toMatchObject({ gender: 'FEMALE', swimmerId: 'c', timeMs: 32000 });
    expect(JSON.stringify(recs)).not.toContain('29000'); // 被排除项未泄漏
  });

  it('同泳者跨年龄段各立一条（年龄组按各成绩赛事日期计）', () => {
    const recs = clubRecords([
      mk({ swimmerId: 'a', resultTimeMs: 30000, meetDate: new Date('2024-06-01T00:00:00.000Z') }), // age 12 → 11-12
      mk({ swimmerId: 'a', resultTimeMs: 29000, meetDate: new Date('2026-06-01T00:00:00.000Z') }), // age 14 → 13-14
    ]);
    expect(recs.map((r) => r.ageGroup).sort()).toEqual(['11-12', '13-14']);
  });
});

describe('personalBests', () => {
  it('每项目取该泳者最快；isClubRecord 命中/未命中', () => {
    const entries: RecordEntry[] = [
      mk({ swimmerId: 'a', resultTimeMs: 30000 }),
      mk({ swimmerId: 'a', resultTimeMs: 29500, meetName: 'M2' }), // 更快 → PB
      mk({ swimmerId: 'a', resultTimeMs: 70000, distanceMeters: 100, stroke: 'BACK' }),
    ];
    const records = clubRecords([
      mk({ swimmerId: 'a', resultTimeMs: 29500, meetName: 'M2' }), // a 持 50 自纪录
      mk({ swimmerId: 'z', resultTimeMs: 60000, distanceMeters: 100, stroke: 'BACK' }), // 他人持 100 仰纪录
    ]);
    const pbs = personalBests(entries, records);
    const free = pbs.find((p) => p.distanceMeters === 50 && p.stroke === 'FREE')!;
    const back = pbs.find((p) => p.distanceMeters === 100 && p.stroke === 'BACK')!;
    expect(free).toMatchObject({ timeMs: 29500, meetName: 'M2', isClubRecord: true });
    expect(back).toMatchObject({ timeMs: 70000, isClubRecord: false });
  });
});
