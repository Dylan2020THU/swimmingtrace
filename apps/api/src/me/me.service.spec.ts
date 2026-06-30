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
