export type Role = 'ADMIN' | 'OWNER' | 'SWIMMER';
export type RegistrationStatus = 'ACTIVE' | 'INACTIVE';

// auth
export interface LoginResponse { accessToken: string; }
export interface MeResponse { id: string; email: string; role: Role; }

// pools
export interface CreatePoolDto { name: string; address?: string; latitude?: number; longitude?: number; }
export interface UpdatePoolDto { name?: string; address?: string; latitude?: number; longitude?: number; }
export interface PoolSummary {
  id: string; name: string; address: string | null;
  latitude: number | null; longitude: number | null;
  memberCount: number; mileageLast30dMeters: number;
  archivedAt: string | null; createdAt: string;
}
export interface PoolDetail {
  id: string; name: string; address: string | null;
  latitude: number | null; longitude: number | null;
  archivedAt: string | null; memberCount: number; createdAt: string;
}

// swimmers / membership
export interface CreateSwimmerDto { name?: string; email: string; }
export interface SwimmerListItem {
  swimmerId: string; name: string | null; email: string;
  status: RegistrationStatus; claimedAt: string | null;
  mileageLast30dMeters: number; joinedAt: string;
}
export interface UpdateMembershipDto { status: RegistrationStatus; }

// 代录
export interface CreateSessionDto { distanceMeters: number; durationSeconds?: number; swamAt: string; }

// stats
export interface HeatmapCell { date: string; distanceMeters: number; }
export interface OverviewStats {
  poolCount: number; memberCount: number; activeMemberCount: number;
  mileageThisMonthMeters: number; sessionsThisMonth: number;
}
export interface PoolStats {
  memberCount: number; activeMemberCount: number; mileageThisMonthMeters: number;
  trend: HeatmapCell[]; heatmap: HeatmapCell[];
}
export interface SwimmerStats {
  summary: { totalDistanceMeters: number; totalDurationSeconds: number; sessionCount: number };
  heatmap: HeatmapCell[];
}
