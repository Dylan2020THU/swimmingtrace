import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChallengesService } from './challenges.service';

const okDto = { name: 'C', goalDistanceMeters: 100000, startDate: '2026-06-01', endDate: '2026-07-01' };
const mkBilling = () => ({ assertFeature: jest.fn().mockResolvedValue(undefined) }) as any;

describe('ChallengesService.create', () => {
  it('校验所有权后创建', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
      challenge: { create: jest.fn().mockResolvedValue({ id: 'c1' }) },
    };
    await new ChallengesService(prisma, mkBilling()).create('o1', 'p1', okDto);
    expect(prisma.challenge.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ poolId: 'p1', name: 'C', goalDistanceMeters: 100000 }) }),
    );
  });

  it('endDate<=startDate → BadRequest，不创建', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
      challenge: { create: jest.fn() },
    };
    await expect(new ChallengesService(prisma, mkBilling()).create('o1', 'p1', { ...okDto, endDate: '2026-06-01' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.challenge.create).not.toHaveBeenCalled();
  });

  it('非本人池 → 403', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'other', archivedAt: null }) },
      challenge: { create: jest.fn() },
    };
    await expect(new ChallengesService(prisma, mkBilling()).create('o1', 'p1', okDto)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ChallengesService.listForPool', () => {
  it('返回挑战含窗口内池总里程', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
      challenge: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c1', poolId: 'p1', name: 'C', goalDistanceMeters: 100000, startDate: new Date('2026-06-01'), endDate: new Date('2026-07-01') },
        ]),
      },
      swimSession: { aggregate: jest.fn().mockResolvedValue({ _sum: { distanceMeters: 42000 } }) },
    };
    const res = await new ChallengesService(prisma, mkBilling()).listForPool('o1', 'p1');
    expect(res[0]).toMatchObject({ id: 'c1', goalDistanceMeters: 100000, totalDistanceMeters: 42000 });
  });
});

describe('ChallengesService.detail', () => {
  it('返回详情 + 排行榜（降序）+ 总里程', async () => {
    const c = {
      id: 'c1', poolId: 'p1', name: 'C', goalDistanceMeters: 100000,
      startDate: new Date('2026-06-01'), endDate: new Date('2026-07-01'), pool: { ownerId: 'o1' },
    };
    const prisma: any = {
      challenge: { findUnique: jest.fn().mockResolvedValue(c) },
      $queryRaw: jest.fn().mockResolvedValue([
        { swimmerId: 's1', name: 'A', email: 'a@x', gender: 'MALE', birthDate: new Date('2012-03-01T00:00:00.000Z'), distanceMeters: BigInt(5000), sessionCount: 3, status: 'ACTIVE' },
        { swimmerId: 's2', name: 'B', email: 'b@x', gender: null, birthDate: null, distanceMeters: BigInt(3000), sessionCount: 2, status: 'INACTIVE' },
      ]),
    };
    const res = await new ChallengesService(prisma, mkBilling()).detail('o1', 'c1');
    expect(res.leaderboard[0]).toEqual({
      swimmerId: 's1', name: 'A', email: 'a@x', gender: 'MALE', birthDate: '2012-03-01T00:00:00.000Z',
      distanceMeters: 5000, sessionCount: 3, status: 'ACTIVE',
    });
    expect(res.leaderboard[1]).toMatchObject({ distanceMeters: 3000, gender: null, birthDate: null, sessionCount: 2, status: 'INACTIVE' });
    expect(res.totalDistanceMeters).toBe(8000);
  });

  it('非本人挑战 → 403', async () => {
    const prisma: any = {
      challenge: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', poolId: 'p1', pool: { ownerId: 'other' } }) },
    };
    await expect(new ChallengesService(prisma, mkBilling()).detail('o1', 'c1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ChallengesService.activeForOwner', () => {
  it('取未归档池中进行中的挑战，含 poolName + 进度', async () => {
    const now = new Date();
    const prisma: any = {
      pool: { findMany: jest.fn().mockResolvedValue([{ id: 'p1' }]) },
      challenge: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1', poolId: 'p1', name: 'C', goalDistanceMeters: 100000,
            startDate: new Date(now.getTime() - 86400000), endDate: new Date(now.getTime() + 86400000), pool: { name: '晨曦' },
          },
        ]),
      },
      swimSession: { aggregate: jest.fn().mockResolvedValue({ _sum: { distanceMeters: 4200 } }) },
    };
    const res = await new ChallengesService(prisma, mkBilling()).activeForOwner('o1');
    expect(prisma.pool.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: 'o1', archivedAt: null } }));
    expect(res[0]).toMatchObject({ id: 'c1', poolName: '晨曦', totalDistanceMeters: 4200 });
  });

  it('无泳池 → 空数组', async () => {
    const prisma: any = { pool: { findMany: jest.fn().mockResolvedValue([]) } };
    expect(await new ChallengesService(prisma, mkBilling()).activeForOwner('o1')).toEqual([]);
  });
});
