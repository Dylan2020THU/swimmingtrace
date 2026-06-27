import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChallengesService } from './challenges.service';

const okDto = { name: 'C', goalDistanceMeters: 100000, startDate: '2026-06-01', endDate: '2026-07-01' };

describe('ChallengesService.create', () => {
  it('校验所有权后创建', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
      challenge: { create: jest.fn().mockResolvedValue({ id: 'c1' }) },
    };
    await new ChallengesService(prisma).create('o1', 'p1', okDto);
    expect(prisma.challenge.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ poolId: 'p1', name: 'C', goalDistanceMeters: 100000 }) }),
    );
  });

  it('endDate<=startDate → BadRequest，不创建', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
      challenge: { create: jest.fn() },
    };
    await expect(new ChallengesService(prisma).create('o1', 'p1', { ...okDto, endDate: '2026-06-01' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.challenge.create).not.toHaveBeenCalled();
  });

  it('非本人池 → 403', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'other', archivedAt: null }) },
      challenge: { create: jest.fn() },
    };
    await expect(new ChallengesService(prisma).create('o1', 'p1', okDto)).rejects.toBeInstanceOf(ForbiddenException);
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
    const res = await new ChallengesService(prisma).listForPool('o1', 'p1');
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
        { swimmerId: 's1', name: 'A', email: 'a@x', distanceMeters: BigInt(5000) },
        { swimmerId: 's2', name: 'B', email: 'b@x', distanceMeters: BigInt(3000) },
      ]),
    };
    const res = await new ChallengesService(prisma).detail('o1', 'c1');
    expect(res.leaderboard[0]).toEqual({ swimmerId: 's1', name: 'A', email: 'a@x', distanceMeters: 5000 });
    expect(res.leaderboard[1].distanceMeters).toBe(3000);
    expect(res.totalDistanceMeters).toBe(8000);
  });

  it('非本人挑战 → 403', async () => {
    const prisma: any = {
      challenge: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', poolId: 'p1', pool: { ownerId: 'other' } }) },
    };
    await expect(new ChallengesService(prisma).detail('o1', 'c1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
