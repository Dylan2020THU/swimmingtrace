import { api } from './client';
import type {
  LoginResponse, MeResponse, CreatePoolDto, UpdatePoolDto, PoolSummary, PoolDetail,
  CreateSwimmerDto, SwimmerListItem, UpdateMembershipDto, CreateSessionDto,
  OverviewStats, PoolStats, SwimmerStats, ClaimLinkResponse,
  ChallengeSummary, ChallengeDetail, CreateChallengeDto, ActiveChallengeItem,
} from '@swim/shared';

export const login = (b: { email: string; password: string }) =>
  api.post<LoginResponse>('/auth/login', b).then((r) => r.data);
export const register = (b: { email: string; password: string; name?: string; role?: 'OWNER' }) =>
  api.post<LoginResponse>('/auth/register', b).then((r) => r.data);
export const getMe = () => api.get<MeResponse>('/auth/me').then((r) => r.data);

export const listPools = (includeArchived = false) =>
  api.get<PoolSummary[]>('/pools', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);
export const getPool = (id: string) => api.get<PoolDetail>(`/pools/${id}`).then((r) => r.data);
export const createPool = (b: CreatePoolDto) => api.post(`/pools`, b).then((r) => r.data);
export const updatePool = (id: string, b: UpdatePoolDto) => api.patch(`/pools/${id}`, b).then((r) => r.data);
export const archivePool = (id: string) => api.post(`/pools/${id}/archive`).then((r) => r.data);

export const listSwimmers = (poolId: string) =>
  api.get<SwimmerListItem[]>(`/pools/${poolId}/swimmers`).then((r) => r.data);
export const createSwimmer = (poolId: string, b: CreateSwimmerDto) =>
  api.post<SwimmerListItem>(`/pools/${poolId}/swimmers`, b).then((r) => r.data);
export const setMembership = (poolId: string, sid: string, b: UpdateMembershipDto) =>
  api.patch(`/pools/${poolId}/swimmers/${sid}`, b).then((r) => r.data);
export const recordSession = (poolId: string, sid: string, b: CreateSessionDto) =>
  api.post(`/pools/${poolId}/swimmers/${sid}/sessions`, b).then((r) => r.data);
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

export const getOverview = () => api.get<OverviewStats>('/stats/overview').then((r) => r.data);
export const getPoolStats = (id: string) => api.get<PoolStats>(`/stats/pool/${id}`).then((r) => r.data);
export const getSwimmerStats = (sid: string) => api.get<SwimmerStats>(`/stats/swimmer/${sid}`).then((r) => r.data);
