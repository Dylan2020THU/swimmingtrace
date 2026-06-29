import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePoolDto, UpdatePoolDto, CreateSwimmerDto, UpdateMembershipDto, CreateSessionDto, CreateChallengeDto } from '@swim/shared';
import * as ep from './api/endpoints';

export const queryKeys = {
  pools: ['pools'] as const,
  pool: (id: string) => ['pool', id] as const,
  swimmers: (poolId: string) => ['swimmers', poolId] as const,
  overview: ['overview'] as const,
  poolStats: (id: string) => ['poolStats', id] as const,
  swimmerStats: (sid: string) => ['swimmerStats', sid] as const,
  challenges: (poolId: string) => ['challenges', poolId] as const,
  challenge: (cid: string) => ['challenge', cid] as const,
  activeChallenges: ['challenges', 'active'] as const,
};

export const useActiveChallenges = () =>
  useQuery({ queryKey: queryKeys.activeChallenges, queryFn: ep.getActiveChallenges });
export const usePoolChallenges = (poolId: string) =>
  useQuery({ queryKey: queryKeys.challenges(poolId), queryFn: () => ep.listChallenges(poolId) });
export const useChallenge = (cid: string) =>
  useQuery({ queryKey: queryKeys.challenge(cid), queryFn: () => ep.getChallenge(cid) });
export function useCreateChallenge(poolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateChallengeDto) => ep.createChallenge(poolId, b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.challenges(poolId) });
      qc.invalidateQueries({ queryKey: queryKeys.activeChallenges });
    },
  });
}
export function useDeleteChallenge(poolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cid: string) => ep.deleteChallenge(cid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.challenges(poolId) });
      qc.invalidateQueries({ queryKey: queryKeys.activeChallenges });
    },
  });
}

export const usePools = (includeArchived = false) =>
  useQuery({ queryKey: [...queryKeys.pools, includeArchived], queryFn: () => ep.listPools(includeArchived) });
export const usePool = (id: string) => useQuery({ queryKey: queryKeys.pool(id), queryFn: () => ep.getPool(id) });
export const useSwimmers = (poolId: string, page = 1) =>
  useQuery({ queryKey: [...queryKeys.swimmers(poolId), page], queryFn: () => ep.listSwimmers(poolId, page) });
export const useOverview = () => useQuery({ queryKey: queryKeys.overview, queryFn: ep.getOverview });
export const usePoolStats = (id: string) => useQuery({ queryKey: queryKeys.poolStats(id), queryFn: () => ep.getPoolStats(id) });
export const useSwimmerStats = (sid: string) =>
  useQuery({ queryKey: queryKeys.swimmerStats(sid), queryFn: () => ep.getSwimmerStats(sid) });

export function useCreatePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreatePoolDto) => ep.createPool(b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.pools }); qc.invalidateQueries({ queryKey: queryKeys.overview }); },
  });
}
export function useUpdatePool(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: UpdatePoolDto) => ep.updatePool(id, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.pool(id) }); qc.invalidateQueries({ queryKey: queryKeys.pools }); qc.invalidateQueries({ queryKey: queryKeys.poolStats(id) }); },
  });
}
export function useArchivePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ep.archivePool(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.pools }); qc.invalidateQueries({ queryKey: queryKeys.overview }); },
  });
}
export function useCreateSwimmer(poolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateSwimmerDto) => ep.createSwimmer(poolId, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.swimmers(poolId) }); qc.invalidateQueries({ queryKey: queryKeys.poolStats(poolId) }); },
  });
}
export function useSetMembership(poolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { sid: string; body: UpdateMembershipDto }) => ep.setMembership(poolId, v.sid, v.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.swimmers(poolId) }),
  });
}
export function useGenerateClaimLink(poolId: string, sid: string) {
  return useMutation({ mutationFn: () => ep.generateClaimLink(poolId, sid) });
}
export function useRecordSession(poolId: string, sid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateSessionDto) => ep.recordSession(poolId, sid, b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.swimmerStats(sid) });
      qc.invalidateQueries({ queryKey: queryKeys.poolStats(poolId) });
      qc.invalidateQueries({ queryKey: queryKeys.swimmers(poolId) });
    },
  });
}
