import { ForbiddenException } from '@nestjs/common';
import { SessionsService } from './sessions.service';

const dto = (poolId?: string) => ({ distanceMeters: 800, swamAt: '2026-02-01T08:00:00.000Z', poolId });

describe('SessionsService.create', () => {
  it('带 poolId 且本人 ACTIVE 登记 → 创建', async () => {
    const prisma: any = {
      registration: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      swimSession: { create: jest.fn().mockResolvedValue({ id: 'ss1' }) },
    };
    await new SessionsService(prisma).create('s1', dto('p1'));
    expect(prisma.registration.findUnique).toHaveBeenCalledWith({
      where: { swimmerId_poolId: { swimmerId: 's1', poolId: 'p1' } },
    });
    expect(prisma.swimSession.create).toHaveBeenCalled();
  });

  it('带 poolId 但非本人 ACTIVE 登记 → Forbidden，不创建', async () => {
    const prisma: any = {
      registration: { findUnique: jest.fn().mockResolvedValue(null) },
      swimSession: { create: jest.fn() },
    };
    await expect(new SessionsService(prisma).create('s1', dto('p1'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.swimSession.create).not.toHaveBeenCalled();
  });

  it('带 poolId 但登记为 INACTIVE → Forbidden', async () => {
    const prisma: any = {
      registration: { findUnique: jest.fn().mockResolvedValue({ status: 'INACTIVE' }) },
      swimSession: { create: jest.fn() },
    };
    await expect(new SessionsService(prisma).create('s1', dto('p1'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('不带 poolId → 直接创建', async () => {
    const prisma: any = { swimSession: { create: jest.fn().mockResolvedValue({ id: 'ss1' }) } };
    await new SessionsService(prisma).create('s1', dto());
    expect(prisma.swimSession.create).toHaveBeenCalled();
  });
});

describe('SessionsService.listForSwimmer', () => {
  it('返回分页信封 {items,total,page,pageSize}，skip 由 page/pageSize 计算', async () => {
    const prisma: any = {
      swimSession: {
        findMany: jest.fn().mockResolvedValue([{ id: 'ss1', distanceMeters: 800, swamAt: new Date('2026-02-01') }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const res = await new SessionsService(prisma).listForSwimmer('s1', 2, 5);
    expect(prisma.swimSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 5, take: 5 }));
    expect(res).toMatchObject({ total: 1, page: 2, pageSize: 5 });
    expect(res.items).toHaveLength(1);
  });
});
