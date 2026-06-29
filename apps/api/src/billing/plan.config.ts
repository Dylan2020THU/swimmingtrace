import { Plan } from '@swim/shared';

export interface PlanLimits {
  maxPools: number;
  maxMembers: number;
  features: { export: boolean; challenges: boolean };
}

/** Plan entitlements live in code (version-controlled), not the DB. Numbers are tunable. */
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: { maxPools: 1, maxMembers: 25, features: { export: false, challenges: false } },
  PRO: { maxPools: 20, maxMembers: 1000, features: { export: true, challenges: true } },
};
