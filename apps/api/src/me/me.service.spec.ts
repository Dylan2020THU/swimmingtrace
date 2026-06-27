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
