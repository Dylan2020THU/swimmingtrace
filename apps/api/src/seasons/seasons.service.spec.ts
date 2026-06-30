import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SeasonsService } from './seasons.service';

const mkBilling = (over: Record<string, unknown> = {}) =>
  ({ assertFeature: jest.fn().mockResolvedValue(undefined), ...over }) as any;

const swimmer = (id: string, name: string) => ({ id, name, gender: 'MALE', birthDate: new Date('2012-03-01T00:00:00.000Z') });

describe('SeasonsService', () => {
  it('createSeason：Pro 门禁 + 落库', async () => {
    const prisma: any = {
      season: { create: jest.fn().mockResolvedValue({ id: 's1', name: 'S', referenceDate: new Date('2026-01-01T00:00:00.000Z'), published: false, createdAt: new Date('2026-01-01T00:00:00.000Z'), _count: { meets: 0 } }) },
    };
    const billing = mkBilling();
    const out = await new SeasonsService(prisma, billing).createSeason('o1', { name: 'S', referenceDate: '2026-01-01T00:00:00.000Z' });
    expect(billing.assertFeature).toHaveBeenCalledWith('o1', 'meets');
    expect(out).toMatchObject({ id: 's1', name: 'S', meetCount: 0, published: false });
  });

  it('ownSeason：不存在 → 404；非本人 → 403', async () => {
    const missing: any = { season: { findUnique: jest.fn().mockResolvedValue(null) } };
    await expect(new SeasonsService(missing, mkBilling()).seasonDetail('o1', 's1')).rejects.toBeInstanceOf(NotFoundException);
    const other: any = { season: { findUnique: jest.fn().mockResolvedValue({ id: 's1', ownerId: 'other' }) } };
    await expect(new SeasonsService(other, mkBilling()).deleteSeason('o1', 's1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('seasonDetail：跨场积分累计（性别×年龄组）', async () => {
    const prisma: any = {
      season: { findUnique: jest.fn().mockResolvedValue({ id: 's1', ownerId: 'o1', name: 'S', referenceDate: new Date('2026-01-01T00:00:00.000Z'), published: false, createdAt: new Date('2026-01-01T00:00:00.000Z') }) },
      meet: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'm1', name: 'M1', meetDate: new Date('2026-02-01T00:00:00.000Z') }]) // meets list
          .mockResolvedValueOnce([
            { events: [{ entries: [
              { swimmer: swimmer('a', 'A'), resultTimeMs: 30000, resultStatus: 'OK' },
              { swimmer: swimmer('b', 'B'), resultTimeMs: 31000, resultStatus: 'OK' },
            ] }] },
          ]), // standings source
      },
    };
    const out = await new SeasonsService(prisma, mkBilling()).seasonDetail('o1', 's1');
    expect(out).toMatchObject({ id: 's1', meetCount: 1 });
    expect(out.standings[0]).toMatchObject({ gender: 'MALE', ageGroup: '13-14' });
    expect(out.standings[0].rows.map((r) => [r.swimmerId, r.points])).toEqual([
      ['a', 9],
      ['b', 7],
    ]);
  });

  it('setSeasonPublished：所有权 + 切换', async () => {
    const prisma: any = { season: { findUnique: jest.fn().mockResolvedValue({ id: 's1', ownerId: 'o1' }), update: jest.fn().mockResolvedValue({}) } };
    expect(await new SeasonsService(prisma, mkBilling()).setSeasonPublished('o1', 's1', true)).toEqual({ published: true });
  });

  it('clubRecordsOf：每格取最快 OK', async () => {
    const prisma: any = {
      meetEntry: {
        findMany: jest.fn().mockResolvedValue([
          { swimmer: swimmer('a', 'A'), resultTimeMs: 30000, resultStatus: 'OK', raceEvent: { distanceMeters: 50, stroke: 'FREE', meet: { ownerId: 'o1', name: 'M', meetDate: new Date('2026-02-01T00:00:00.000Z') } } },
          { swimmer: swimmer('b', 'B'), resultTimeMs: 31000, resultStatus: 'OK', raceEvent: { distanceMeters: 50, stroke: 'FREE', meet: { ownerId: 'o1', name: 'M', meetDate: new Date('2026-02-01T00:00:00.000Z') } } },
        ]),
      },
    };
    const recs = await new SeasonsService(prisma, mkBilling()).clubRecordsOf('o1');
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ distanceMeters: 50, stroke: 'FREE', gender: 'MALE', ageGroup: '13-14', swimmerId: 'a', timeMs: 30000 });
  });
});
