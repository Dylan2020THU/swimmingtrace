import { PrismaHealthIndicator } from './prisma.health';

describe('PrismaHealthIndicator', () => {
  it('查询成功 → up', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) } as never;
    const ind = new PrismaHealthIndicator(prisma);
    await expect(ind.isHealthy('database')).resolves.toEqual({ database: { status: 'up' } });
  });

  it('查询失败 → 抛错', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('down')) } as never;
    const ind = new PrismaHealthIndicator(prisma);
    await expect(ind.isHealthy('database')).rejects.toBeInstanceOf(Error);
  });
});
