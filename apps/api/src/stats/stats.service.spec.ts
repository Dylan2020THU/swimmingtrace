import { ForbiddenException } from '@nestjs/common';
import { StatsService } from './stats.service';

describe('StatsService.overview', () => {
  it('无泳池 → 全 0', async () => {
    const prisma: any = { pool: { findMany: jest.fn().mockResolvedValue([]) } };
    const svc = new StatsService(prisma, { get: () => 'UTC' } as any);
    await expect(svc.overview('o1')).resolves.toEqual({
      poolCount: 0, memberCount: 0, activeMemberCount: 0, mileageThisMonthMeters: 0, sessionsThisMonth: 0,
    });
  });
  it('有泳池 → 汇总会员与本月里程', async () => {
    const prisma: any = {
      pool: { findMany: jest.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]) },
      registration: { count: jest.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(4) },
      swimSession: { aggregate: jest.fn().mockResolvedValue({ _sum: { distanceMeters: 8000 }, _count: 12 }) },
    };
    const svc = new StatsService(prisma, { get: () => 'UTC' } as any);
    await expect(svc.overview('o1')).resolves.toEqual({
      poolCount: 2, memberCount: 5, activeMemberCount: 4, mileageThisMonthMeters: 8000, sessionsThisMonth: 12,
    });
  });
});

describe('StatsService.poolStats', () => {
  it('非本人 → 403', async () => {
    const prisma: any = { pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'other', archivedAt: null }) } };
    const svc = new StatsService(prisma, { get: () => 'UTC' } as any);
    await expect(svc.poolStats('o1', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('本人 → 返回 memberCount/里程/trend/heatmap', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
      registration: { count: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(2) },
      swimSession: { aggregate: jest.fn().mockResolvedValue({ _sum: { distanceMeters: 500 } }) },
      $queryRaw: jest.fn().mockResolvedValue([{ day: '2026-02-01', total: BigInt(500) }]),
    };
    const svc = new StatsService(prisma, { get: () => 'UTC' } as any);
    const res = await svc.poolStats('o1', 'p1');
    expect(prisma.registration.count).toHaveBeenNthCalledWith(1, { where: { poolId: 'p1' } });
    expect(prisma.registration.count).toHaveBeenNthCalledWith(2, { where: { poolId: 'p1', status: 'ACTIVE' } });
    expect(res.memberCount).toBe(3);
    expect(res.activeMemberCount).toBe(2);
    expect(res.heatmap).toEqual([{ date: '2026-02-01', distanceMeters: 500 }]);
    expect(res.trend).toEqual(res.heatmap);
  });
});

describe('StatsService.swimmerStats', () => {
  it('非本人名下游泳者 → 403', async () => {
    const prisma: any = { registration: { findFirst: jest.fn().mockResolvedValue(null) } };
    const svc = new StatsService(prisma, { get: () => 'UTC' } as any);
    await expect(svc.swimmerStats('o1', 's1')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('本人名下 → 返回 summary + heatmap', async () => {
    const prisma: any = {
      registration: { findFirst: jest.fn().mockResolvedValue({ id: 'r1' }) },
      swimSession: { aggregate: jest.fn().mockResolvedValue({ _sum: { distanceMeters: 3000, durationSeconds: 1800 }, _count: 4 }) },
      $queryRaw: jest.fn().mockResolvedValue([{ day: '2026-03-02', total: BigInt(3000) }]),
    };
    const svc = new StatsService(prisma, { get: () => 'UTC' } as any);
    const res = await svc.swimmerStats('o1', 's1');
    expect(res.summary).toEqual({ totalDistanceMeters: 3000, totalDurationSeconds: 1800, sessionCount: 4 });
    expect(res.heatmap).toEqual([{ date: '2026-03-02', distanceMeters: 3000 }]);
  });
});
