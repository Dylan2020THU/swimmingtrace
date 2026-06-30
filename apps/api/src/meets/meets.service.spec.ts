import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { MeetsService } from './meets.service';

const mkBilling = (over: Record<string, unknown> = {}) =>
  ({ assertFeature: jest.fn().mockResolvedValue(undefined), ...over }) as any;

describe('MeetsService', () => {
  it('createMeet：Pro 门禁 + 落库', async () => {
    const prisma: any = {
      meet: {
        create: jest.fn().mockResolvedValue({ id: 'm1', name: 'Spring', meetDate: new Date('2026-07-01T00:00:00.000Z'), hostPoolId: null, hostPool: null, createdAt: new Date('2026-06-30T00:00:00.000Z') }),
      },
    };
    const billing = mkBilling();
    const out = await new MeetsService(prisma, billing).createMeet('o1', { name: 'Spring', meetDate: '2026-07-01T00:00:00.000Z' });
    expect(billing.assertFeature).toHaveBeenCalledWith('o1', 'meets');
    expect(out).toMatchObject({ id: 'm1', name: 'Spring', eventCount: 0, hostPoolName: null });
  });

  it('meetDetail：非本人赛事 → 403', async () => {
    const prisma: any = { meet: { findUnique: jest.fn().mockResolvedValue({ id: 'm1', ownerId: 'other' }) } };
    await expect(new MeetsService(prisma, mkBilling()).meetDetail('o1', 'm1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('addEntry：会员缺 gender/birthDate → 422，不建报名', async () => {
    const prisma: any = {
      raceEvent: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', meet: { ownerId: 'o1' } }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 's1', name: 'A', email: 'a@x', gender: null, birthDate: null }) },
      registration: { findFirst: jest.fn().mockResolvedValue({ id: 'r1' }) },
      meetEntry: { create: jest.fn() },
    };
    await expect(new MeetsService(prisma, mkBilling()).addEntry('o1', 'e1', { swimmerId: 's1' })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.meetEntry.create).not.toHaveBeenCalled();
  });

  it('addEntry：非本 owner 会员 → 404', async () => {
    const prisma: any = {
      raceEvent: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', meet: { ownerId: 'o1' } }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 's1', gender: 'MALE', birthDate: new Date('2012-01-01') }) },
      registration: { findFirst: jest.fn().mockResolvedValue(null) },
      meetEntry: { create: jest.fn() },
    };
    await expect(new MeetsService(prisma, mkBilling()).addEntry('o1', 'e1', { swimmerId: 's1' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('setResult：更新成绩并返回 EntryItem', async () => {
    const prisma: any = {
      meetEntry: {
        findUnique: jest.fn().mockResolvedValue({ id: 'en1', swimmerId: 's1', raceEvent: { meet: { ownerId: 'o1' } } }),
        update: jest.fn().mockResolvedValue({
          id: 'en1', swimmerId: 's1', seedTimeMs: null, resultTimeMs: 30000, resultStatus: 'OK',
          swimmer: { id: 's1', name: 'A', email: 'a@x', gender: 'MALE', birthDate: new Date('2012-01-01T00:00:00.000Z') },
        }),
      },
    };
    const out = await new MeetsService(prisma, mkBilling()).setResult('o1', 'en1', { resultStatus: 'OK', resultTimeMs: 30000 });
    expect(out).toMatchObject({ id: 'en1', resultTimeMs: 30000, resultStatus: 'OK', name: 'A' });
  });

  it('standingsOf：按时间排名 + 金银（同组）', async () => {
    const prisma: any = {
      raceEvent: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', meetId: 'm1', meet: { ownerId: 'o1', meetDate: new Date('2026-06-30T00:00:00.000Z') } }) },
      meetEntry: {
        findMany: jest.fn().mockResolvedValue([
          { resultTimeMs: 31000, resultStatus: 'OK', swimmer: { id: 'b', name: 'B', gender: 'MALE', birthDate: new Date('2012-01-01T00:00:00.000Z') } },
          { resultTimeMs: 30000, resultStatus: 'OK', swimmer: { id: 'a', name: 'A', gender: 'MALE', birthDate: new Date('2012-01-01T00:00:00.000Z') } },
        ]),
      },
    };
    const g = await new MeetsService(prisma, mkBilling()).standingsOf('o1', 'e1');
    expect(g).toHaveLength(1);
    expect(g[0].rows.map((r) => [r.name, r.rank, r.medal])).toEqual([
      ['A', 1, 'gold'],
      ['B', 2, 'silver'],
    ]);
  });
});
