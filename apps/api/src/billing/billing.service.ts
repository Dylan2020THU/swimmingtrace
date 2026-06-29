import { Injectable } from '@nestjs/common';
import { Plan, PlanInfo } from '@swim/shared';
import { PrismaService } from '../prisma.service';
import { PaymentRequiredException } from '../common/payment-required.exception';
import { PLAN_LIMITS } from './plan.config';

/**
 * Owner subscription entitlements: reports plan/usage and enforces quotas +
 * feature gates. Limits come from PLAN_LIMITS (code config). Violations raise 402.
 */
@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  private async planOf(ownerId: string): Promise<Plan> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { plan: true } });
    return u.plan;
  }

  private countPools(ownerId: string): Promise<number> {
    return this.prisma.pool.count({ where: { ownerId, archivedAt: null } });
  }

  private countMembers(ownerId: string): Promise<number> {
    return this.prisma.registration.count({ where: { pool: { ownerId } } });
  }

  async getPlanInfo(ownerId: string): Promise<PlanInfo> {
    const plan = await this.planOf(ownerId);
    const limits = PLAN_LIMITS[plan];
    const [pools, members] = await Promise.all([this.countPools(ownerId), this.countMembers(ownerId)]);
    return {
      plan,
      limits: { maxPools: limits.maxPools, maxMembers: limits.maxMembers },
      usage: { pools, members },
      features: limits.features,
    };
  }

  async assertCanCreatePool(ownerId: string): Promise<void> {
    const plan = await this.planOf(ownerId);
    const { maxPools } = PLAN_LIMITS[plan];
    if ((await this.countPools(ownerId)) >= maxPools) {
      throw new PaymentRequiredException(`已达 ${plan} 计划上限（最多 ${maxPools} 个泳池），请升级到 Pro`);
    }
  }

  async assertCanAddMember(ownerId: string): Promise<void> {
    const plan = await this.planOf(ownerId);
    const { maxMembers } = PLAN_LIMITS[plan];
    if ((await this.countMembers(ownerId)) >= maxMembers) {
      throw new PaymentRequiredException(`已达 ${plan} 计划上限（最多 ${maxMembers} 名会员），请升级到 Pro`);
    }
  }

  async assertFeature(ownerId: string, feature: 'export' | 'challenges' | 'apiKeys'): Promise<void> {
    const plan = await this.planOf(ownerId);
    if (!PLAN_LIMITS[plan].features[feature]) {
      const label = feature === 'export' ? '数据导出' : feature === 'challenges' ? '挑战赛' : 'API Keys';
      throw new PaymentRequiredException(`${label}为 Pro 功能，请升级到 Pro`);
    }
  }

  async setPlan(ownerId: string, plan: Plan): Promise<PlanInfo> {
    await this.prisma.user.update({ where: { id: ownerId }, data: { plan, planUpdatedAt: new Date() } });
    return this.getPlanInfo(ownerId);
  }
}
