import { StatsService } from './stats.service';

describe('StatsService.overview', () => {
  it('无泳池 → 全 0', async () => {
    const prisma: any = { pool: { findMany: jest.fn().mockResolvedValue([]) } };
    const svc = new StatsService(prisma);
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
    const svc = new StatsService(prisma);
    await expect(svc.overview('o1')).resolves.toEqual({
      poolCount: 2, memberCount: 5, activeMemberCount: 4, mileageThisMonthMeters: 8000, sessionsThisMonth: 12,
    });
  });
});
