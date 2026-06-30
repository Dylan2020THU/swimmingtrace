import { lanePriority, seedHeats } from './seeding';

describe('lanePriority', () => {
  it('中心向外', () => {
    expect(lanePriority(6)).toEqual([3, 4, 2, 5, 1, 6]);
    expect(lanePriority(8)).toEqual([4, 5, 3, 6, 2, 7, 1, 8]);
  });
});

describe('seedHeats', () => {
  const t = (id: string, ms: number | null) => ({ id, seedTimeMs: ms });

  it('8 人 / 6 道：最快进末组中心道，第 7/8 名在 heat 1', () => {
    const entries = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) => t(id, (i + 1) * 1000));
    const seeded = seedHeats(entries, 6);
    const by = Object.fromEntries(seeded.map((s) => [s.id, s]));
    // 2 heats; fastest (a) → heat 2, centre lane 3
    expect(by.a).toMatchObject({ heat: 2, lane: 3 });
    expect(by.b).toMatchObject({ heat: 2, lane: 4 });
    expect(by.f).toMatchObject({ heat: 2, lane: 6 });
    // 7th & 8th (g,h) → heat 1, centre lanes 3,4
    expect(by.g).toMatchObject({ heat: 1, lane: 3 });
    expect(by.h).toMatchObject({ heat: 1, lane: 4 });
  });

  it('整除：12 人 / 6 道 = 2 满组', () => {
    const entries = Array.from({ length: 12 }, (_, i) => t(`s${i}`, (i + 1) * 100));
    const seeded = seedHeats(entries, 6);
    expect(new Set(seeded.map((s) => s.heat))).toEqual(new Set([1, 2]));
    expect(seeded.filter((s) => s.heat === 2)).toHaveLength(6);
    expect(seeded.filter((s) => s.heat === 1)).toHaveLength(6);
  });

  it('无种子成绩者视为最慢（排进 heat 1）', () => {
    const entries = [t('fast', 1000), t('mid', 2000), t('none', null)];
    const seeded = seedHeats(entries, 6);
    // 单组，全在 heat 1；fast 中心道 3，none 最慢
    const by = Object.fromEntries(seeded.map((s) => [s.id, s]));
    expect(by.fast).toMatchObject({ heat: 1, lane: 3 });
    expect(by.none.lane).toBe(2); // 第三快 → lanePriority[2]=2
  });

  it('空与单人', () => {
    expect(seedHeats([], 6)).toEqual([]);
    expect(seedHeats([t('x', 1000)], 6)).toEqual([{ id: 'x', heat: 1, lane: 3 }]);
  });
});
