import { api } from './client';
import { idempotencyKey } from '../idempotency';
import type {
  LoginResponse, MeResponse, CreatePoolDto, UpdatePoolDto, PoolSummary, PoolDetail,
  CreateSwimmerDto, SwimmerListItem, UpdateMembershipDto, CreateSessionDto, Paginated,
  OverviewStats, PoolStats, SwimmerStats, ClaimLinkResponse,
  ChallengeSummary, ChallengeDetail, CreateChallengeDto, ActiveChallengeItem, AccountExport, Plan, PlanInfo,
  ApiKeyListItem, CreatedApiKey,
  MeetSummary, MeetDetail, RaceEventItem, EntryItem, StandingsGroup,
  CreateMeetDto, CreateRaceEventDto, CreateEntryDto, SetResultDto,
} from '@swim/shared';

export const login = (b: { email: string; password: string }) =>
  api.post<LoginResponse>('/auth/login', b).then((r) => r.data);
export const register = (b: { email: string; password: string; name?: string; role?: 'OWNER' }) =>
  api.post<LoginResponse>('/auth/register', b).then((r) => r.data);
export const getMe = () => api.get<MeResponse>('/auth/me').then((r) => r.data);
export const logout = (refreshToken: string) =>
  api.post('/auth/logout', { refreshToken }).then((r) => r.data);
export const forgotPassword = (email: string) =>
  api.post('/auth/forgot-password', { email }).then((r) => r.data);
export const resetPassword = (token: string, password: string) =>
  api.post('/auth/reset-password', { token, password }).then((r) => r.data);
export const verifyEmail = (token: string) =>
  api.post('/auth/verify-email', { token }).then((r) => r.data);
export const resendVerification = () =>
  api.post('/auth/resend-verification').then((r) => r.data);

export const listPools = (includeArchived = false) =>
  api.get<PoolSummary[]>('/pools', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);
export const getPool = (id: string) => api.get<PoolDetail>(`/pools/${id}`).then((r) => r.data);
export const createPool = (b: CreatePoolDto) => api.post(`/pools`, b).then((r) => r.data);
export const updatePool = (id: string, b: UpdatePoolDto) => api.patch(`/pools/${id}`, b).then((r) => r.data);
export const archivePool = (id: string) => api.post(`/pools/${id}/archive`).then((r) => r.data);

export const listSwimmers = (poolId: string, page = 1) =>
  api.get<Paginated<SwimmerListItem>>(`/pools/${poolId}/swimmers`, { params: { page } }).then((r) => r.data);
export const createSwimmer = (poolId: string, b: CreateSwimmerDto) =>
  api.post<SwimmerListItem>(`/pools/${poolId}/swimmers`, b).then((r) => r.data);
export const setMembership = (poolId: string, sid: string, b: UpdateMembershipDto) =>
  api.patch(`/pools/${poolId}/swimmers/${sid}`, b).then((r) => r.data);
export const recordSession = (poolId: string, sid: string, b: CreateSessionDto) =>
  api.post(`/pools/${poolId}/swimmers/${sid}/sessions`, b, {
    headers: { 'Idempotency-Key': idempotencyKey() },
  }).then((r) => r.data);
export const generateClaimLink = (poolId: string, sid: string) =>
  api.post<ClaimLinkResponse>(`/pools/${poolId}/swimmers/${sid}/claim-link`).then((r) => r.data);

export const listChallenges = (poolId: string) =>
  api.get<ChallengeSummary[]>(`/pools/${poolId}/challenges`).then((r) => r.data);
export const createChallenge = (poolId: string, b: CreateChallengeDto) =>
  api.post<ChallengeSummary>(`/pools/${poolId}/challenges`, b).then((r) => r.data);
export const getChallenge = (cid: string) =>
  api.get<ChallengeDetail>(`/challenges/${cid}`).then((r) => r.data);
export const deleteChallenge = (cid: string) => api.delete(`/challenges/${cid}`).then((r) => r.data);
export const getActiveChallenges = () =>
  api.get<ActiveChallengeItem[]>('/challenges/active').then((r) => r.data);

export const getPlan = () => api.get<PlanInfo>('/account/plan').then((r) => r.data);
export const setPlan = (plan: Plan) => api.post<PlanInfo>('/account/plan', { plan }).then((r) => r.data);
export const listApiKeys = () => api.get<ApiKeyListItem[]>('/api-keys').then((r) => r.data);
export const createApiKey = (label: string) =>
  api.post<CreatedApiKey>('/api-keys', { label }).then((r) => r.data);
export const revokeApiKey = (id: string) => api.delete(`/api-keys/${id}`).then((r) => r.data);

export const exportAccount = () => api.get<AccountExport>('/account/export').then((r) => r.data);
export const deleteAccount = (password: string) =>
  api.delete('/account', { data: { password } }).then((r) => r.data);

// meets (competition platform E1)
export const listMeets = () => api.get<MeetSummary[]>('/meets').then((r) => r.data);
export const getMeet = (id: string) => api.get<MeetDetail>(`/meets/${id}`).then((r) => r.data);
export const createMeet = (b: CreateMeetDto) => api.post<MeetSummary>('/meets', b).then((r) => r.data);
export const deleteMeet = (id: string) => api.delete(`/meets/${id}`).then((r) => r.data);
export const addRaceEvent = (meetId: string, b: CreateRaceEventDto) =>
  api.post<RaceEventItem>(`/meets/${meetId}/events`, b).then((r) => r.data);
export const deleteRaceEvent = (eid: string) => api.delete(`/events/${eid}`).then((r) => r.data);
export const listEntries = (eid: string) => api.get<EntryItem[]>(`/events/${eid}/entries`).then((r) => r.data);
export const addEntry = (eid: string, b: CreateEntryDto) => api.post<EntryItem>(`/events/${eid}/entries`, b).then((r) => r.data);
export const deleteEntry = (enid: string) => api.delete(`/entries/${enid}`).then((r) => r.data);
export const setEntryResult = (enid: string, b: SetResultDto) =>
  api.patch<EntryItem>(`/entries/${enid}/result`, b).then((r) => r.data);
export const getStandings = (eid: string) => api.get<StandingsGroup[]>(`/events/${eid}/standings`).then((r) => r.data);

export const getOverview = () => api.get<OverviewStats>('/stats/overview').then((r) => r.data);
export const getPoolStats = (id: string) => api.get<PoolStats>(`/stats/pool/${id}`).then((r) => r.data);
export const getSwimmerStats = (sid: string) => api.get<SwimmerStats>(`/stats/swimmer/${sid}`).then((r) => r.data);
