import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    expect(prisma.registration.count).toHaveBeenCalledWith({ where: { poolId: 'p1' } });
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
    expect(prisma.registration.count).toHaveBeenCalledWith({ where: { poolId: 'p1' } });
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

jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('HASH') }));

describe('PoolsService.createSwimmer', () => {
  const base = () => ({
    pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
    user: { findUnique: jest.fn(), create: jest.fn() },
    registration: { upsert: jest.fn().mockResolvedValue({ status: 'ACTIVE', joinedAt: new Date('2026-02-01') }) },
  });

  it('新邮箱 → 建 SWIMMER + 随机密码 + 登记', async () => {
    const prisma: any = base();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 's1', name: 'Sam', email: 'a@b.c', claimedAt: null });
    const svc = new PoolsService(prisma);
    const res = await svc.createSwimmer('o1', 'p1', { name: 'Sam', email: 'a@b.c' });
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: 'a@b.c', role: 'SWIMMER', passwordHash: 'HASH' }) }));
    expect(prisma.registration.upsert).toHaveBeenCalled();
    expect(res).toMatchObject({ swimmerId: 's1', email: 'a@b.c', status: 'ACTIVE' });
  });

  it('邮箱已存在 → 复用用户，不再 create', async () => {
    const prisma: any = base();
    prisma.user.findUnique.mockResolvedValue({ id: 's9', name: 'Old', email: 'a@b.c', claimedAt: null });
    const svc = new PoolsService(prisma);
    const res = await svc.createSwimmer('o1', 'p1', { email: 'a@b.c' });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(res.swimmerId).toBe('s9');
  });

  it('复用用户且原 name 为 null → 自动补全 name', async () => {
    const prisma: any = base();
    prisma.user.findUnique.mockResolvedValue({ id: 's9', name: null, email: 'a@b.c', claimedAt: null });
    prisma.user.update = jest.fn().mockResolvedValue({ id: 's9', name: 'New', email: 'a@b.c', claimedAt: null });
    const svc = new PoolsService(prisma);
    await svc.createSwimmer('o1', 'p1', { name: 'New', email: 'a@b.c' });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 's9' }, data: { name: 'New' } });
  });
});

describe('PoolsService.listSwimmers', () => {
  it('返回 SwimmerListItem[] 含状态与近 30 天里程', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
      registration: { findMany: jest.fn().mockResolvedValue([
        { swimmerId: 's1', status: 'ACTIVE', joinedAt: new Date('2026-02-01'),
          swimmer: { id: 's1', name: 'Sam', email: 'a@b.c', claimedAt: null } },
      ]) },
      swimSession: { aggregate: jest.fn().mockResolvedValue({ _sum: { distanceMeters: 700 } }) },
    };
    const svc = new PoolsService(prisma);
    const res = await svc.listSwimmers('o1', 'p1');
    expect(res[0]).toMatchObject({ swimmerId: 's1', email: 'a@b.c', status: 'ACTIVE', mileageLast30dMeters: 700 });
  });
});

describe('PoolsService.setMembershipStatus', () => {
  it('校验所有权后更新 Registration 状态', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
      registration: { update: jest.fn().mockResolvedValue({ status: 'INACTIVE' }) },
    };
    const svc = new PoolsService(prisma);
    await svc.setMembershipStatus('o1', 'p1', 's1', { status: 'INACTIVE' });
    expect(prisma.registration.update).toHaveBeenCalledWith({
      where: { swimmerId_poolId: { swimmerId: 's1', poolId: 'p1' } },
      data: { status: 'INACTIVE' },
    });
  });

  it('游泳者未登记在本池（P2025）→ NotFoundException', async () => {
    const p2025 = new Prisma.PrismaClientKnownRequestError('not found', { code: 'P2025', clientVersion: 'test' });
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
      registration: { update: jest.fn().mockRejectedValue(p2025) },
    };
    const svc = new PoolsService(prisma);
    await expect(svc.setMembershipStatus('o1', 'p1', 'ghost', { status: 'INACTIVE' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PoolsService.recordSessionForSwimmer', () => {
  it('校验泳池与本池登记后创建 session', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
      registration: { findUnique: jest.fn().mockResolvedValue({ id: 'r1' }) },
      swimSession: { create: jest.fn().mockResolvedValue({ id: 'ss1' }) },
    };
    const svc = new PoolsService(prisma);
    await svc.recordSessionForSwimmer('o1', 'p1', 's1', { distanceMeters: 1000, swamAt: '2026-02-01T08:00:00.000Z' });
    expect(prisma.registration.findUnique).toHaveBeenCalledWith({ where: { swimmerId_poolId: { swimmerId: 's1', poolId: 'p1' } } });
    expect(prisma.swimSession.create).toHaveBeenCalledWith({
      data: { swimmerId: 's1', poolId: 'p1', distanceMeters: 1000, durationSeconds: undefined, swamAt: new Date('2026-02-01T08:00:00.000Z') },
    });
  });

  it('游泳者未登记在本池 → NotFoundException，不创建 session', async () => {
    const prisma: any = {
      pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'o1', archivedAt: null }) },
      registration: { findUnique: jest.fn().mockResolvedValue(null) },
      swimSession: { create: jest.fn() },
    };
    const svc = new PoolsService(prisma);
    await expect(
      svc.recordSessionForSwimmer('o1', 'p1', 'ghost', { distanceMeters: 1000, swamAt: '2026-02-01T08:00:00.000Z' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.swimSession.create).not.toHaveBeenCalled();
  });
});
