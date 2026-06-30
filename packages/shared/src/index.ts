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
export interface LeaderboardRow {
  swimmerId: string; name: string | null; email: string; distanceMeters: number;
  gender: Gender | null; birthDate: string | null; sessionCount: number; status: RegistrationStatus;
}
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

// member profile (owner-facing GitHub-style member page at /swimmers/:sid)
export interface MemberProfile {
  swimmerId: string; name: string | null; email: string;
  gender: Gender | null; birthDate: string | null;
  claimedAt: string | null; createdAt: string;
  pools: Array<{ poolId: string; poolName: string; status: RegistrationStatus; joinedAt: string }>;
}
export interface MemberSessionRow {
  id: string; swamAt: string; distanceMeters: number;
  durationSeconds: number | null; poolId: string | null; poolName: string | null;
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

// age groups — shared by the meets domain (standings/records) and owner member tables.
export interface AgeBand { label: string; minAge?: number; maxAge?: number; }
/** Swim age bands, computed by actual age on a reference date. Tunable. */
export const AGE_GROUPS: AgeBand[] = [
  { label: '6至8岁', minAge: 6, maxAge: 8 },
  { label: '9至14岁', minAge: 9, maxAge: 14 },
  { label: '15至18岁', minAge: 15, maxAge: 18 },
  { label: '19至35岁', minAge: 19, maxAge: 35 },
  { label: '36至45岁', minAge: 36, maxAge: 45 },
  { label: '46至55岁', minAge: 46, maxAge: 55 },
  { label: '56至69岁', minAge: 56, maxAge: 69 },
  { label: '70岁以上', minAge: 70 },
];
/** Whole-years age of `birthDate` as of `on` (UTC). */
export function ageAt(birthDate: Date, on: Date): number {
  let age = on.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = on.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < birthDate.getUTCDate())) age--;
  return age;
}
export function ageGroupOf(birthDate: Date, on: Date): string {
  const age = ageAt(birthDate, on);
  for (const b of AGE_GROUPS) {
    if ((b.minAge === undefined || age >= b.minAge) && (b.maxAge === undefined || age <= b.maxAge)) {
      return b.label;
    }
  }
  // Below the youngest band (e.g. under 6) clamps to the youngest; the oldest band is open-ended.
  return AGE_GROUPS[0].label;
}

export interface MeetSummary {
  id: string; name: string; meetDate: string;
  hostPoolId: string | null; hostPoolName: string | null;
  laneCount: number; eventCount: number; published: boolean; registrationOpen: boolean;
  seasonId: string | null; seasonName: string | null; createdAt: string;
}
export interface RaceEventItem { id: string; distanceMeters: number; stroke: Stroke; order: number; entryCount: number; }
export interface MeetDetail extends MeetSummary { events: RaceEventItem[]; }
export interface EntryItem {
  id: string; swimmerId: string; name: string | null; email: string;
  gender: Gender | null; birthDate: string | null;
  seedTimeMs: number | null; resultTimeMs: number | null; resultStatus: ResultStatus;
  heat: number | null; lane: number | null;
}
export interface StandingRow {
  rank: number | null; medal: Medal | null;
  swimmerId: string; name: string | null;
  resultTimeMs: number | null; resultStatus: ResultStatus;
}
export interface StandingsGroup { gender: Gender; ageGroup: string; rows: StandingRow[]; }

export interface CreateMeetDto { name: string; meetDate: string; hostPoolId?: string | null; laneCount?: number; }
export interface CreateRaceEventDto { distanceMeters: number; stroke: Stroke; }
export interface CreateEntryDto { swimmerId: string; seedTimeMs?: number | null; }
export interface SetResultDto { resultStatus: ResultStatus; resultTimeMs?: number | null; }
export interface SetPublishedDto { published: boolean; }

// public event pages (E3) — PII-safe projections served unauthenticated for published meets
export interface PublicRaceEvent { id: string; distanceMeters: number; stroke: Stroke; order: number; entryCount: number; }
export interface PublicMeet {
  id: string; name: string; meetDate: string;
  hostPoolName: string | null; laneCount: number; events: PublicRaceEvent[];
}
export interface PublicStartListEntry { lane: number; name: string | null; seedTimeMs: number | null; }
export interface PublicStartListHeat { heat: number; entries: PublicStartListEntry[]; }

// self-registration (E4) — swimmer self-registers for an owner's open meets
export interface UpdateProfileDto { gender?: Gender; birthDate?: string; }
export interface SetRegistrationDto { registrationOpen: boolean; }
export interface SelfEntryDto { seedTimeMs?: number | null; }
export interface MyMeetEvent {
  id: string; distanceMeters: number; stroke: Stroke; order: number;
  myEntryId: string | null; mySeedTimeMs: number | null;
}
export interface MyMeet {
  id: string; name: string; meetDate: string; hostPoolName: string | null;
  events: MyMeetEvent[];
}

// records & points (E5) — season points leaderboard + club records / personal bests
export interface CreateSeasonDto { name: string; referenceDate: string; }
export interface SetSeasonPublishedDto { published: boolean; }
export interface AssignSeasonDto { seasonId: string | null; }
export interface SeasonSummary {
  id: string; name: string; referenceDate: string;
  published: boolean; meetCount: number; createdAt: string;
}
export interface SeasonStandingRow { rank: number | null; swimmerId: string; name: string | null; points: number; }
export interface SeasonStandingsGroup { gender: Gender; ageGroup: string; rows: SeasonStandingRow[]; }
export interface SeasonDetail extends SeasonSummary {
  meets: Array<{ id: string; name: string; meetDate: string }>;
  standings: SeasonStandingsGroup[];
}
// A club record: fastest-ever OK time per (distance × stroke × gender × age-group). No ownerId (PII-safe).
export interface RecordRow {
  distanceMeters: number; stroke: Stroke; gender: Gender; ageGroup: string;
  swimmerId: string; name: string | null; timeMs: number; meetName: string; meetDate: string;
}
// A swimmer's personal best per (distance × stroke), flagged if it is the current club record.
export interface PbRow {
  distanceMeters: number; stroke: Stroke; timeMs: number;
  meetName: string; meetDate: string; isClubRecord: boolean;
}
export interface PublicSeason { id: string; name: string; standings: SeasonStandingsGroup[]; }

// platform — uniform error envelope returned by the global exception filter for ALL errors
export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId: string;
  timestamp: string;
  path: string;
}
