import { ForbiddenException } from '@nestjs/common';
import { PoolsService } from './pools.service';

const mkPrisma = (o: any = {}) => ({
  pool: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), ...o.pool },
  registration: { count: jest.fn().mockResolvedValue(0), ...o.registration },
  swimSession: { aggregate: jest.fn().mockResolvedValue({ _sum: { distanceMeters: null } }), ...o.swimSession },
}) as any;

describe('PoolsService.listMyPools', () => {
  it('默认只取未归档，并带 memberCount 与近 30 天里程', async () => {
    const prisma = mkPrisma({
      pool: { findMany: jest.fn().mockResolvedValue([
        { id: 'p1', name: 'A', address: null, latitude: null, longitude: null, archivedAt: null, createdAt: new Date('2026-01-01') },
      ]) },
      registration: { count: jest.fn().mockResolvedValue(3) },
      swimSession: { aggregate: jest.fn().mockResolvedValue({ _sum: { distanceMeters: 1200 } }) },
    });
    const svc = new PoolsService(prisma);
    const res = await svc.listMyPools('o1');
    expect(prisma.pool.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: 'o1', archivedAt: null } }));
    expect(res[0]).toMatchObject({ id: 'p1', memberCount: 3, mileageLast30dMeters: 1200 });
  });

  it('includeArchived 时不过滤 archivedAt', async () => {
    const prisma = mkPrisma();
    const svc = new PoolsService(prisma);
    await svc.listMyPools('o1', true);
    expect(prisma.pool.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: 'o1' } }));
  });
});

describe('PoolsService.getPool', () => {
  it('非本人 → 403', async () => {
    const prisma = mkPrisma({ pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'other', archivedAt: null }) } });
    const svc = new PoolsService(prisma);
    await expect(svc.getPool('o1', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('本人 → 返回详情含 memberCount', async () => {
    const prisma = mkPrisma({
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', name: 'A', address: null, latitude: null, longitude: null, archivedAt: null, ownerId: 'o1', createdAt: new Date('2026-01-01') }) },
      registration: { count: jest.fn().mockResolvedValue(2) },
    });
    const svc = new PoolsService(prisma);
    await expect(svc.getPool('o1', 'p1')).resolves.toMatchObject({ id: 'p1', memberCount: 2 });
  });
});

describe('PoolsService.updatePool / archivePool', () => {
  it('updatePool 校验所有权后更新', async () => {
    const prisma = mkPrisma({
      pool: {
        findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }),
        update: jest.fn().mockResolvedValue({ id: 'p1', name: 'B' }),
      },
    });
    const svc = new PoolsService(prisma);
    await svc.updatePool('o1', 'p1', { name: 'B' });
    expect(prisma.pool.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { name: 'B' } });
  });
  it('archivePool 设置 archivedAt', async () => {
    const prisma = mkPrisma({
      pool: {
        findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }),
        update: jest.fn().mockResolvedValue({ id: 'p1', archivedAt: new Date() }),
      },
    });
    const svc = new PoolsService(prisma);
    await svc.archivePool('o1', 'p1');
    expect(prisma.pool.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1' } }));
    expect(prisma.pool.update.mock.calls[0][0].data.archivedAt).toBeInstanceOf(Date);
  });
});
