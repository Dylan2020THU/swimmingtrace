import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MeetsService } from './meets.service';

const mkBilling = (over: Record<string, unknown> = {}) =>
  ({ assertFeature: jest.fn().mockResolvedValue(undefined), ...over }) as any;

describe('MeetsService', () => {
  it('createMeet：Pro 门禁 + 落库', async () => {
    const prisma: any = {
      meet: {
        create: jest.fn().mockResolvedValue({ id: 'm1', name: 'Spring', meetDate: new Date('2026-07-01T00:00:00.000Z'), hostPoolId: null, hostPool: null, laneCount: 6, published: false, registrationOpen: false, createdAt: new Date('2026-06-30T00:00:00.000Z') }),
      },
    };
    const billing = mkBilling();
    const out = await new MeetsService(prisma, billing).createMeet('o1', { name: 'Spring', meetDate: '2026-07-01T00:00:00.000Z' });
    expect(billing.assertFeature).toHaveBeenCalledWith('o1', 'meets');
    expect(out).toMatchObject({ id: 'm1', name: 'Spring', eventCount: 0, hostPoolName: null, laneCount: 6, published: false, registrationOpen: false });
  });

  it('setPublished：所有权 + 切换', async () => {
    const prisma: any = { meet: { findUnique: jest.fn().mockResolvedValue({ id: 'm1', ownerId: 'o1' }), update: jest.fn().mockResolvedValue({}) } };
    const res = await new MeetsService(prisma, mkBilling()).setPublished('o1', 'm1', true);
    expect(res).toEqual({ published: true });
    expect(prisma.meet.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { published: true } });
  });

  it('publicMeet：未发布 → 404；已发布 → 投影（无 email）', async () => {
    const unp: any = { meet: { findUnique: jest.fn().mockResolvedValue({ id: 'm1', published: false }) } };
    await expect(new MeetsService(unp, mkBilling()).publicMeet('m1')).rejects.toBeInstanceOf(NotFoundException);

    const pub: any = {
      meet: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'm1', name: 'X', meetDate: new Date('2026-06-30T00:00:00.000Z'), hostPool: { name: 'P' }, laneCount: 6, published: true,
          createdAt: new Date('2026-06-30T00:00:00.000Z'),
          events: [{ id: 'e1', distanceMeters: 50, stroke: 'FREE', order: 0, _count: { entries: 2 } }],
        }),
      },
    };
    const out = await new MeetsService(pub, mkBilling()).publicMeet('m1');
    expect(out).toMatchObject({ id: 'm1', name: 'X', laneCount: 6 });
    expect(out.events[0]).toMatchObject({ distanceMeters: 50, entryCount: 2 });
    expect(JSON.stringify(out)).not.toContain('@');
  });

  it('publicStartList：只露 name/lane/seed，无 email', async () => {
    const prisma: any = {
      raceEvent: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', meet: { published: true } }) },
      meetEntry: {
        findMany: jest.fn().mockResolvedValue([
          { heat: 1, lane: 3, seedTimeMs: 28760, swimmer: { name: 'Sam' } },
          { heat: 1, lane: 4, seedTimeMs: 29340, swimmer: { name: 'Bob' } },
        ]),
      },
    };
    const out = await new MeetsService(prisma, mkBilling()).publicStartList('e1');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ heat: 1 });
    expect(out[0].entries).toEqual([
      { lane: 3, name: 'Sam', seedTimeMs: 28760 },
      { lane: 4, name: 'Bob', seedTimeMs: 29340 },
    ]);
    expect(JSON.stringify(out)).not.toContain('@');
  });

  it('seedEvent：按种子成绩排道并落库（heat/lane）', async () => {
    const prisma: any = {
      raceEvent: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', meetId: 'm1', meet: { ownerId: 'o1', laneCount: 6 } }) },
      meetEntry: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'a', seedTimeMs: 1000 }, { id: 'b', seedTimeMs: 2000 }])
          .mockResolvedValueOnce([
            { id: 'a', swimmerId: 'a', seedTimeMs: 1000, resultTimeMs: null, resultStatus: 'ENTERED', heat: 1, lane: 3, swimmer: { id: 'a', name: 'A', email: 'a@x', gender: 'MALE', birthDate: new Date('2012-01-01') } },
            { id: 'b', swimmerId: 'b', seedTimeMs: 2000, resultTimeMs: null, resultStatus: 'ENTERED', heat: 1, lane: 4, swimmer: { id: 'b', name: 'B', email: 'b@x', gender: 'MALE', birthDate: new Date('2012-01-01') } },
          ]),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const out = await new MeetsService(prisma, mkBilling()).seedEvent('o1', 'e1');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.meetEntry.update).toHaveBeenCalledTimes(2);
    expect(out.find((e) => e.id === 'a')).toMatchObject({ heat: 1, lane: 3 });
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

  // ---- self-registration (E4) ----
  it('setRegistrationOpen：所有权 + 切换', async () => {
    const prisma: any = { meet: { findUnique: jest.fn().mockResolvedValue({ id: 'm1', ownerId: 'o1' }), update: jest.fn().mockResolvedValue({}) } };
    const res = await new MeetsService(prisma, mkBilling()).setRegistrationOpen('o1', 'm1', true);
    expect(res).toEqual({ registrationOpen: true });
    expect(prisma.meet.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { registrationOpen: true } });
  });

  it('myOpenMeets：仅活跃会员所属、且开放报名的赛事，含我的报名', async () => {
    const prisma: any = {
      registration: { findMany: jest.fn().mockResolvedValue([{ pool: { ownerId: 'o1' } }]) },
      meet: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'm1', name: 'Spring', meetDate: new Date('2026-07-01T00:00:00.000Z'), hostPool: { name: 'P' },
            events: [
              { id: 'e1', distanceMeters: 50, stroke: 'FREE', order: 0, entries: [{ id: 'en1', seedTimeMs: 28760 }] },
              { id: 'e2', distanceMeters: 100, stroke: 'BACK', order: 1, entries: [] },
            ],
          },
        ]),
      },
    };
    const out = await new MeetsService(prisma, mkBilling()).myOpenMeets('s1');
    expect(prisma.meet.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { registrationOpen: true, ownerId: { in: ['o1'] } } }));
    expect(out).toHaveLength(1);
    expect(out[0].events[0]).toMatchObject({ id: 'e1', myEntryId: 'en1', mySeedTimeMs: 28760 });
    expect(out[0].events[1]).toMatchObject({ id: 'e2', myEntryId: null, mySeedTimeMs: null });
  });

  it('myOpenMeets：无活跃会员 → []', async () => {
    const prisma: any = { registration: { findMany: jest.fn().mockResolvedValue([]) }, meet: { findMany: jest.fn() } };
    const out = await new MeetsService(prisma, mkBilling()).myOpenMeets('s1');
    expect(out).toEqual([]);
    expect(prisma.meet.findMany).not.toHaveBeenCalled();
  });

  it('selfRegister：未开放报名 → 403', async () => {
    const prisma: any = { raceEvent: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', meet: { ownerId: 'o1', registrationOpen: false } }) } };
    await expect(new MeetsService(prisma, mkBilling()).selfRegister('s1', 'e1', {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('selfRegister：非主办方会员 → 403', async () => {
    const prisma: any = {
      raceEvent: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', meet: { ownerId: 'o1', registrationOpen: true } }) },
      registration: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    await expect(new MeetsService(prisma, mkBilling()).selfRegister('s1', 'e1', {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('selfRegister：缺 gender/birthDate → 422，不建报名', async () => {
    const prisma: any = {
      raceEvent: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', meet: { ownerId: 'o1', registrationOpen: true } }) },
      registration: { findFirst: jest.fn().mockResolvedValue({ id: 'r1' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 's1', gender: null, birthDate: null }) },
      meetEntry: { create: jest.fn() },
    };
    await expect(new MeetsService(prisma, mkBilling()).selfRegister('s1', 'e1', {})).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.meetEntry.create).not.toHaveBeenCalled();
  });

  it('selfRegister：成功落库并返回 EntryItem', async () => {
    const prisma: any = {
      raceEvent: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', meet: { ownerId: 'o1', registrationOpen: true } }) },
      registration: { findFirst: jest.fn().mockResolvedValue({ id: 'r1' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 's1', name: 'A', email: 'a@x', gender: 'MALE', birthDate: new Date('2012-01-01T00:00:00.000Z') }) },
      meetEntry: { create: jest.fn().mockResolvedValue({ id: 'en1', swimmerId: 's1', seedTimeMs: 28760, resultTimeMs: null, resultStatus: 'ENTERED', heat: null, lane: null }) },
    };
    const out = await new MeetsService(prisma, mkBilling()).selfRegister('s1', 'e1', { seedTimeMs: 28760 });
    expect(out).toMatchObject({ id: 'en1', swimmerId: 's1', seedTimeMs: 28760, name: 'A' });
  });

  it('selfRegister：重复报名 → 409', async () => {
    const prisma: any = {
      raceEvent: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', meet: { ownerId: 'o1', registrationOpen: true } }) },
      registration: { findFirst: jest.fn().mockResolvedValue({ id: 'r1' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 's1', name: 'A', email: 'a@x', gender: 'MALE', birthDate: new Date('2012-01-01T00:00:00.000Z') }) },
      meetEntry: { create: jest.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' })) },
    };
    await expect(new MeetsService(prisma, mkBilling()).selfRegister('s1', 'e1', {})).rejects.toBeInstanceOf(ConflictException);
  });

  it('withdrawOwn：仅本人 → 非本人 403', async () => {
    const prisma: any = { meetEntry: { findUnique: jest.fn().mockResolvedValue({ id: 'en1', swimmerId: 'other', resultStatus: 'ENTERED', resultTimeMs: null }), delete: jest.fn() } };
    await expect(new MeetsService(prisma, mkBilling()).withdrawOwn('s1', 'en1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.meetEntry.delete).not.toHaveBeenCalled();
  });

  it('withdrawOwn：已有成绩 → 409，不删', async () => {
    const prisma: any = { meetEntry: { findUnique: jest.fn().mockResolvedValue({ id: 'en1', swimmerId: 's1', resultStatus: 'OK', resultTimeMs: 30000 }), delete: jest.fn() } };
    await expect(new MeetsService(prisma, mkBilling()).withdrawOwn('s1', 'en1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.meetEntry.delete).not.toHaveBeenCalled();
  });

  it('withdrawOwn：本人且无成绩 → 删除', async () => {
    const prisma: any = { meetEntry: { findUnique: jest.fn().mockResolvedValue({ id: 'en1', swimmerId: 's1', resultStatus: 'ENTERED', resultTimeMs: null }), delete: jest.fn().mockResolvedValue({}) } };
    const res = await new MeetsService(prisma, mkBilling()).withdrawOwn('s1', 'en1');
    expect(res).toEqual({ ok: true });
    expect(prisma.meetEntry.delete).toHaveBeenCalledWith({ where: { id: 'en1' } });
  });
});
