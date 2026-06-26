import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { assertOwnsPool, assertOwnsSwimmer } from './ownership';

const mkPrisma = (overrides: any = {}) => ({
  pool: { findUnique: jest.fn(), ...overrides.pool },
  registration: { findFirst: jest.fn(), ...overrides.registration },
}) as any;

describe('assertOwnsPool', () => {
  it('pool 不存在 → NotFoundException', async () => {
    const prisma = mkPrisma({ pool: { findUnique: jest.fn().mockResolvedValue(null) } });
    await expect(assertOwnsPool(prisma, 'o1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('非本人 → ForbiddenException', async () => {
    const prisma = mkPrisma({ pool: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', ownerId: 'other', archivedAt: null }) } });
    await expect(assertOwnsPool(prisma, 'o1', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('本人 → 返回 pool', async () => {
    const pool = { id: 'p1', ownerId: 'o1', archivedAt: null };
    const prisma = mkPrisma({ pool: { findUnique: jest.fn().mockResolvedValue(pool) } });
    await expect(assertOwnsPool(prisma, 'o1', 'p1')).resolves.toEqual(pool);
  });
});

describe('assertOwnsSwimmer', () => {
  it('无关联 → ForbiddenException', async () => {
    const prisma = mkPrisma({ registration: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(assertOwnsSwimmer(prisma, 'o1', 's1')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('有关联 → 通过', async () => {
    const prisma = mkPrisma({ registration: { findFirst: jest.fn().mockResolvedValue({ id: 'r1' }) } });
    await expect(assertOwnsSwimmer(prisma, 'o1', 's1')).resolves.toBeUndefined();
  });
});
