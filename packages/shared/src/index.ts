export type Role = 'ADMIN' | 'OWNER' | 'SWIMMER';
export type RegistrationStatus = 'ACTIVE' | 'INACTIVE';

// auth
export interface LoginResponse { accessToken: string; refreshToken: string; }
export interface MeResponse { id: string; email: string; role: Role; emailVerifiedAt?: string | null; }

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
export interface CreateSwimmerDto { name?: string; email: string; gender?: Gender; birthDate?: string; }
export interface SwimmerListItem {
  swimmerId: string; name: string | null; email: string;
  status: RegistrationStatus; claimedAt: string | null;
  mileageLast30dMeters: number; joinedAt: string;
  gender: Gender | null; birthDate: string | null;
}
export interface UpdateMembershipDto { status?: RegistrationStatus; gender?: Gender | null; birthDate?: string | null; }

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

// challenges — a time-boxed collective pool distance goal with a per-swimmer leaderboard
export interface CreateChallengeDto { name: string; goalDistanceMeters: number; startDate: string; endDate: string; }
export interface ChallengeSummary {
  id: string; poolId: string; name: string;
  goalDistanceMeters: number; startDate: string; endDate: string;
  totalDistanceMeters: number; // window-total distance for the pool
}
export interface LeaderboardRow { swimmerId: string; name: string | null; email: string; distanceMeters: number; }
export interface ChallengeDetail extends ChallengeSummary { leaderboard: LeaderboardRow[]; }
export interface ActiveChallengeItem extends ChallengeSummary { poolName: string; }

// nearby pools (PostGIS radius search) — swimmer "find nearby pools" discovery
export interface NearbyPlace {
  id: string; name: string; address: string | null;
  latitude: number; longitude: number; distanceMeters: number;
}
export interface MyChallengeItem {
  id: string; poolId: string; poolName: string; name: string;
  goalDistanceMeters: number; totalDistanceMeters: number;
  myDistanceMeters: number; myRank: number | null; // null = no sessions in window
  startDate: string; endDate: string;
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

// pagination — offset-paginated list envelope
export interface Paginated<T> { items: T[]; total: number; page: number; pageSize: number; }

// data & compliance — owner self-service export (portability) + account deletion (erasure)
export interface AccountExport {
  exportedAt: string;
  account: { id: string; email: string; name: string | null; role: string; createdAt: string };
  pools: Array<{
    id: string; name: string; address: string | null;
    latitude: number | null; longitude: number | null;
    createdAt: string; archivedAt: string | null;
    swimmers: Array<{ swimmerId: string; email: string; name: string | null; status: string; joinedAt: string }>;
    sessions: Array<{ id: string; swimmerId: string; poolId: string | null; distanceMeters: number; durationSeconds: number | null; swamAt: string; createdAt: string }>;
    challenges: Array<{ id: string; name: string; goalDistanceMeters: number; startDate: string; endDate: string }>;
  }>;
}
export interface DeleteAccountDto { password: string; }

// billing — owner subscription plan (internal Free/Pro; quota + feature gating)
export type Plan = 'FREE' | 'PRO';
export interface PlanInfo {
  plan: Plan;
  limits: { maxPools: number; maxMembers: number };
  usage: { pools: number; members: number };
  features: { export: boolean; challenges: boolean; apiKeys: boolean; meets: boolean };
}
export interface SetPlanDto { plan: Plan; }

// api keys — programmatic owner access (act-as-owner; stored hashed, plaintext shown once)
export interface ApiKeyListItem { id: string; label: string; prefix: string; lastUsedAt: string | null; createdAt: string; }
export interface CreatedApiKey { id: string; label: string; prefix: string; key: string; createdAt: string; }
export interface CreateApiKeyDto { label: string; }

// meets (competition platform E1) — meet → race events → entries(+results) → standings by gender × age-group
export type Gender = 'MALE' | 'FEMALE';
export type Stroke = 'FREE' | 'BACK' | 'BREAST' | 'FLY' | 'IM';
export type ResultStatus = 'ENTERED' | 'OK' | 'DNS' | 'DNF' | 'DQ';
export type Medal = 'gold' | 'silver' | 'bronze';

export interface MeetSummary {
  id: string; name: string; meetDate: string;
  hostPoolId: string | null; hostPoolName: string | null;
  eventCount: number; createdAt: string;
}
export interface RaceEventItem { id: string; distanceMeters: number; stroke: Stroke; order: number; entryCount: number; }
export interface MeetDetail extends MeetSummary { events: RaceEventItem[]; }
export interface EntryItem {
  id: string; swimmerId: string; name: string | null; email: string;
  gender: Gender | null; birthDate: string | null;
  seedTimeMs: number | null; resultTimeMs: number | null; resultStatus: ResultStatus;
}
export interface StandingRow {
  rank: number | null; medal: Medal | null;
  swimmerId: string; name: string | null;
  resultTimeMs: number | null; resultStatus: ResultStatus;
}
export interface StandingsGroup { gender: Gender; ageGroup: string; rows: StandingRow[]; }

export interface CreateMeetDto { name: string; meetDate: string; hostPoolId?: string | null; }
export interface CreateRaceEventDto { distanceMeters: number; stroke: Stroke; }
export interface CreateEntryDto { swimmerId: string; seedTimeMs?: number | null; }
export interface SetResultDto { resultStatus: ResultStatus; resultTimeMs?: number | null; }

// platform — uniform error envelope returned by the global exception filter for ALL errors
export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId: string;
  timestamp: string;
  path: string;
}
