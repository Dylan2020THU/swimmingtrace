import { MeService } from './me.service';

describe('MeService.myPools', () => {
  it('返回本人 ACTIVE 登记的泳池 {id,name}', async () => {
    const prisma: any = {
      registration: {
        findMany: jest.fn().mockResolvedValue([
          { pool: { id: 'p1', name: 'A' } },
          { pool: { id: 'p2', name: 'B' } },
        ]),
      },
    };
    const svc = new MeService(prisma, {} as any);
    const res = await svc.myPools('s1');
    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { swimmerId: 's1', status: 'ACTIVE' } }),
    );
    expect(res).toEqual([
      { id: 'p1', name: 'A' },
      { id: 'p2', name: 'B' },
    ]);
  });
});

describe('MeService.updateProfile', () => {
  it('仅写入提供的字段并返回标准化资料', async () => {
    const prisma: any = {
      user: { update: jest.fn().mockResolvedValue({ gender: 'FEMALE', birthDate: new Date('2010-05-04T00:00:00.000Z') }) },
    };
    const res = await new MeService(prisma, {} as any).updateProfile('s1', { gender: 'FEMALE', birthDate: '2010-05-04T00:00:00.000Z' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { gender: 'FEMALE', birthDate: new Date('2010-05-04T00:00:00.000Z') },
    });
    expect(res).toEqual({ gender: 'FEMALE', birthDate: '2010-05-04T00:00:00.000Z' });
  });

  it('未提供字段不写入（部分更新）', async () => {
    const prisma: any = { user: { update: jest.fn().mockResolvedValue({ gender: 'MALE', birthDate: null }) } };
    await new MeService(prisma, {} as any).updateProfile('s1', { gender: 'MALE' });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { gender: 'MALE' } });
  });
});

describe('MeService.myRecords', () => {
  const sw = { id: 's1', name: 'Me', gender: 'MALE', birthDate: new Date('2012-03-01T00:00:00.000Z') };
  const ev = (timeMs: number, meetName: string) => ({
    swimmer: sw, resultTimeMs: timeMs, resultStatus: 'OK',
    raceEvent: { distanceMeters: 50, stroke: 'FREE', meet: { ownerId: 'o1', name: meetName, meetDate: new Date('2026-02-01T00:00:00.000Z') } },
  });

  it('每项目取最快 PB，并标注是否赛会纪录', async () => {
    const prisma: any = {
      meetEntry: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([ev(30000, 'M1'), ev(29500, 'M2')]) // mine
          .mockResolvedValueOnce([
            ev(29500, 'M2'),
            { swimmer: { id: 'x', name: 'X', gender: 'MALE', birthDate: new Date('2012-03-01T00:00:00.000Z') }, resultTimeMs: 31000, resultStatus: 'OK', raceEvent: { distanceMeters: 50, stroke: 'FREE', meet: { ownerId: 'o1', name: 'M', meetDate: new Date('2026-02-01T00:00:00.000Z') } } },
          ]), // all owner entries
      },
    };
    const res = await new MeService(prisma, {} as any).myRecords('s1');
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ distanceMeters: 50, stroke: 'FREE', timeMs: 29500, isClubRecord: true });
  });

  it('无报名 → 空数组', async () => {
    const prisma: any = { meetEntry: { findMany: jest.fn().mockResolvedValue([]) } };
    expect(await new MeService(prisma, {} as any).myRecords('s1')).toEqual([]);
  });
});

describe('MeService.myChallenges', () => {
  it('返回进行中挑战 + 我的名次/里程/池进度', async () => {
    const prisma: any = {
      registration: { findMany: jest.fn().mockResolvedValue([{ poolId: 'p1' }]) },
      challenge: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c1', poolId: 'p1', name: 'C', goalDistanceMeters: 100000, startDate: new Date('2026-06-01'), endDate: new Date('2026-07-01'), pool: { name: '晨曦' } },
        ]),
      },
    };
    const challenges: any = {
      leaderboardOf: jest.fn().mockResolvedValue([
        { swimmerId: 'x', name: 'X', email: 'x@x', distanceMeters: 5000 },
        { swimmerId: 's1', name: 'Me', email: 'me@x', distanceMeters: 3000 },
      ]),
    };
    const res = await new MeService(prisma, challenges).myChallenges('s1');
    expect(res[0]).toMatchObject({
      id: 'c1', poolName: '晨曦', totalDistanceMeters: 8000, myDistanceMeters: 3000, myRank: 2,
    });
  });

  it('无 ACTIVE 池 → 空数组', async () => {
    const prisma: any = { registration: { findMany: jest.fn().mockResolvedValue([]) } };
    const res = await new MeService(prisma, {} as any).myChallenges('s1');
    expect(res).toEqual([]);
  });

  it('我在窗口内无记录 → myRank=null, myDistance=0', async () => {
    const prisma: any = {
      registration: { findMany: jest.fn().mockResolvedValue([{ poolId: 'p1' }]) },
      challenge: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c1', poolId: 'p1', name: 'C', goalDistanceMeters: 100000, startDate: new Date('2026-06-01'), endDate: new Date('2026-07-01'), pool: { name: '晨曦' } },
        ]),
      },
    };
    const challenges: any = { leaderboardOf: jest.fn().mockResolvedValue([{ swimmerId: 'x', name: 'X', email: 'x@x', distanceMeters: 5000 }]) };
    const res = await new MeService(prisma, challenges).myChallenges('s1');
    expect(res[0]).toMatchObject({ myDistanceMeters: 0, myRank: null });
  });
});
