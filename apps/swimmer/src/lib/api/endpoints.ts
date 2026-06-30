import { api } from './client';
import { idempotencyKey } from '../idempotency';
import type {
  LoginResponse, MeResponse, ClaimInfoResponse, ClaimAccountDto,
  MyPoolItem, CreateSessionDto, SwimSessionItem, HeatmapCell, SwimmerStats, MyChallengeItem, NearbyPlace, Paginated,
  MyMeet, SelfEntryDto, EntryItem, UpdateProfileDto,
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
export const forgotPassword = (email: string) =>
  api.post('/auth/forgot-password', { email }).then((r) => r.data);
export const resetPassword = (token: string, password: string) =>
  api.post('/auth/reset-password', { token, password }).then((r) => r.data);

export const getMyPools = () => api.get<MyPoolItem[]>('/me/pools').then((r) => r.data);
export const recordMySession = (b: CreateSessionDto) =>
  api.post('/sessions', b, { headers: { 'Idempotency-Key': idempotencyKey() } }).then((r) => r.data);
export const getMySessions = (page = 1) =>
  api.get<Paginated<SwimSessionItem>>('/sessions/me', { params: { page } }).then((r) => r.data);
export const getMySummary = () =>
  api.get<SwimmerStats['summary']>('/stats/summary').then((r) => r.data);
export const getMyHeatmap = (year?: number) =>
  api.get<HeatmapCell[]>('/stats/heatmap', { params: year ? { year } : {} }).then((r) => r.data);
export const getMyChallenges = () => api.get<MyChallengeItem[]>('/me/challenges').then((r) => r.data);
export const getNearbyPlaces = (lat: number, lng: number, radiusMeters = 5000) =>
  api.get<NearbyPlace[]>('/places/nearby', { params: { lat, lng, radiusMeters } }).then((r) => r.data);

// self-registration (E4)
export const getMyMeets = () => api.get<MyMeet[]>('/me/meets').then((r) => r.data);
export const selfRegister = (eventId: string, b: SelfEntryDto) =>
  api.post<EntryItem>(`/me/meets/events/${eventId}/entries`, b, { headers: { 'Idempotency-Key': idempotencyKey() } }).then((r) => r.data);
export const withdrawEntry = (entryId: string) =>
  api.delete(`/me/meets/entries/${entryId}`).then((r) => r.data);
export const updateProfile = (b: UpdateProfileDto) =>
  api.patch<{ gender: string | null; birthDate: string | null }>('/me/profile', b).then((r) => r.data);
