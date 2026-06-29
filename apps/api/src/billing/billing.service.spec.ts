import { BillingService } from './billing.service';
import { PaymentRequiredException } from '../common/payment-required.exception';

function prismaMock() {
  return {
    user: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    pool: { count: jest.fn().mockResolvedValue(0) },
    registration: { count: jest.fn().mockResolvedValue(0) },
  } as any;
}

describe('BillingService', () => {
  it('getPlanInfo 返回计划/限额/用量/功能', async () => {
    const prisma = prismaMock();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ plan: 'FREE' });
    prisma.pool.count.mockResolvedValue(1);
    prisma.registration.count.mockResolvedValue(10);
    const info = await new BillingService(prisma).getPlanInfo('o1');
    expect(info).toMatchObject({
      plan: 'FREE',
      limits: { maxPools: 1, maxMembers: 25 },
      usage: { pools: 1, members: 10 },
      features: { export: false, challenges: false },
    });
  });

  it('assertCanCreatePool：达限 → 402，未达 → 放行', async () => {
    const prisma = prismaMock();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ plan: 'FREE' });
    prisma.pool.count.mockResolvedValue(1); // FREE maxPools=1 → 达限
    await expect(new BillingService(prisma).assertCanCreatePool('o1')).rejects.toBeInstanceOf(PaymentRequiredException);
    prisma.pool.count.mockResolvedValue(0);
    await expect(new BillingService(prisma).assertCanCreatePool('o1')).resolves.toBeUndefined();
  });

  it('assertCanAddMember：达限 → 402', async () => {
    const prisma = prismaMock();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ plan: 'FREE' });
    prisma.registration.count.mockResolvedValue(25); // FREE maxMembers=25
    await expect(new BillingService(prisma).assertCanAddMember('o1')).rejects.toBeInstanceOf(PaymentRequiredException);
  });

  it('assertFeature：FREE 无 export → 402；PRO → 放行', async () => {
    const prisma = prismaMock();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ plan: 'FREE' });
    await expect(new BillingService(prisma).assertFeature('o1', 'export')).rejects.toBeInstanceOf(PaymentRequiredException);
    prisma.user.findUniqueOrThrow.mockResolvedValue({ plan: 'PRO' });
    await expect(new BillingService(prisma).assertFeature('o1', 'export')).resolves.toBeUndefined();
  });

  it('setPlan：更新 plan + planUpdatedAt，返回新 info', async () => {
    const prisma = prismaMock();
    prisma.user.update.mockResolvedValue({});
    prisma.user.findUniqueOrThrow.mockResolvedValue({ plan: 'PRO' });
    const info = await new BillingService(prisma).setPlan('o1', 'PRO');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'o1' }, data: expect.objectContaining({ plan: 'PRO', planUpdatedAt: expect.any(Date) }) }),
    );
    expect(info.plan).toBe('PRO');
  });
});
