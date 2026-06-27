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

// session recording — owner 代录 (poolId via URL) or swimmer self-record (poolId in body)
export interface CreateSessionDto { distanceMeters: number; durationSeconds?: number; swamAt: string; poolId?: string; }

// claim — owner generates a one-time claim link; swimmer claims to set a password.
export interface ClaimLinkResponse { claimToken: string; claimUrl: string; expiresAt: string; }
export interface ClaimInfoResponse { name: string | null; email: string; }
export interface ClaimAccountDto { token: string; password: string; }

// the swimmer's own pools (for selecting where to self-record)
export interface MyPoolItem { id: string; name: string; }

// a row of the swimmer's own session history (GET /sessions/me)
export interface SwimSessionItem {
  id: string; poolId: string | null; distanceMeters: number;
  durationSeconds: number | null; swamAt: string;
}

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
