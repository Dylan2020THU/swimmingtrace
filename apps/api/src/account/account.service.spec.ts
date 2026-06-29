jest.mock('bcrypt', () => ({ compare: jest.fn() }));
import * as bcrypt from 'bcrypt';
import { UnauthorizedException } from '@nestjs/common';
import { AccountService } from './account.service';

const mkBilling = () => ({ assertFeature: jest.fn().mockResolvedValue(undefined) }) as any;

describe('AccountService.exportData', () => {
  it('组装账号 + 池图，日期转 ISO', async () => {
    const prisma: any = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'o1', email: 'o@x.com', name: 'O', role: 'OWNER', createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
      pool: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'p1', name: 'P', address: null, latitude: null, longitude: null,
            createdAt: new Date('2026-02-01T00:00:00.000Z'), archivedAt: null,
            registrations: [
              { status: 'ACTIVE', joinedAt: new Date('2026-02-02T00:00:00.000Z'), swimmer: { id: 's1', email: 's@x.com', name: 'S' } },
            ],
            sessions: [
              { id: 'ss1', swimmerId: 's1', poolId: 'p1', distanceMeters: 100, durationSeconds: null, swamAt: new Date('2026-02-03T00:00:00.000Z'), createdAt: new Date('2026-02-03T00:00:00.000Z') },
            ],
            challenges: [
              { id: 'c1', name: 'C', goalDistanceMeters: 1000, startDate: new Date('2026-02-01T00:00:00.000Z'), endDate: new Date('2026-03-01T00:00:00.000Z') },
            ],
          },
        ]),
      },
    };
    const out = await new AccountService(prisma, mkBilling()).exportData('o1');
    expect(out.account).toMatchObject({ id: 'o1', email: 'o@x.com', role: 'OWNER' });
    expect(out.account.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(out.pools[0].swimmers[0]).toMatchObject({ swimmerId: 's1', email: 's@x.com', status: 'ACTIVE' });
    expect(out.pools[0].sessions[0]).toMatchObject({ id: 'ss1', distanceMeters: 100 });
    expect(out.pools[0].challenges[0].name).toBe('C');
    expect(typeof out.exportedAt).toBe('string');
  });
});

describe('AccountService.deleteAccount', () => {
  it('密码错 → Unauthorized，不删任何东西', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'o1', passwordHash: 'H' }) },
      $transaction: jest.fn(),
    };
    await expect(new AccountService(prisma, mkBilling()).deleteAccount('o1', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('密码对 → 事务按序删除池图与账号', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'o1', passwordHash: 'H' }), delete: jest.fn() },
      pool: { findMany: jest.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]), deleteMany: jest.fn() },
      swimSession: { deleteMany: jest.fn() },
      challenge: { deleteMany: jest.fn() },
      registration: { deleteMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const res = await new AccountService(prisma, mkBilling()).deleteAccount('o1', 'right');
    expect(res).toEqual({ ok: true });
    expect(prisma.swimSession.deleteMany).toHaveBeenCalledWith({ where: { poolId: { in: ['p1', 'p2'] } } });
    expect(prisma.challenge.deleteMany).toHaveBeenCalledWith({ where: { poolId: { in: ['p1', 'p2'] } } });
    expect(prisma.registration.deleteMany).toHaveBeenCalledWith({ where: { poolId: { in: ['p1', 'p2'] } } });
    expect(prisma.pool.deleteMany).toHaveBeenCalledWith({ where: { ownerId: 'o1' } });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'o1' } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
