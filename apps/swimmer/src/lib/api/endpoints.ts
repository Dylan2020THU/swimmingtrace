import { api } from './client';
import type {
  LoginResponse, MeResponse, ClaimInfoResponse, ClaimAccountDto,
  MyPoolItem, CreateSessionDto, SwimSessionItem, HeatmapCell, SwimmerStats, MyChallengeItem, NearbyPlace,
} from '@swim/shared';

export const login = (b: { email: string; password: string }) =>
  api.post<LoginResponse>('/auth/login', b).then((r) => r.data);
export const getMe = () => api.get<MeResponse>('/auth/me').then((r) => r.data);

export const getClaimInfo = (token: string) =>
  api.get<ClaimInfoResponse>(`/auth/claim/${token}`).then((r) => r.data);
export const claim = (b: ClaimAccountDto) =>
  api.post<LoginResponse>('/auth/claim', b).then((r) => r.data);
export const logout = (refreshToken: string) =>
  api.post('/auth/logout', { refreshToken }).then((r) => r.data);

export const getMyPools = () => api.get<MyPoolItem[]>('/me/pools').then((r) => r.data);
export const recordMySession = (b: CreateSessionDto) => api.post('/sessions', b).then((r) => r.data);
export const getMySessions = () => api.get<SwimSessionItem[]>('/sessions/me').then((r) => r.data);
export const getMySummary = () =>
  api.get<SwimmerStats['summary']>('/stats/summary').then((r) => r.data);
export const getMyHeatmap = (year?: number) =>
  api.get<HeatmapCell[]>('/stats/heatmap', { params: year ? { year } : {} }).then((r) => r.data);
export const getMyChallenges = () => api.get<MyChallengeItem[]>('/me/challenges').then((r) => r.data);
export const getNearbyPlaces = (lat: number, lng: number, radiusMeters = 5000) =>
  api.get<NearbyPlace[]>('/places/nearby', { params: { lat, lng, radiusMeters } }).then((r) => r.data);
