import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePoolDto, UpdatePoolDto, CreateSwimmerDto, UpdateMembershipDto, CreateSessionDto, CreateChallengeDto, Plan,
  CreateMeetDto, CreateRaceEventDto, CreateEntryDto, SetResultDto,
} from '@swim/shared';
import * as ep from './api/endpoints';

export const usePlan = () => useQuery({ queryKey: ['plan'], queryFn: ep.getPlan });
export const useApiKeys = () => useQuery({ queryKey: ['apiKeys'], queryFn: ep.listApiKeys });
export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label: string) => ep.createApiKey(label),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apiKeys'] }),
  });
}
export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ep.revokeApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apiKeys'] }),
  });
}
export function useSetPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (plan: Plan) => ep.setPlan(plan),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan'] }),
  });
}

// meets (competition platform E1)
export const useMeets = () => useQuery({ queryKey: ['meets'], queryFn: ep.listMeets });
export const useMeet = (id: string) => useQuery({ queryKey: ['meet', id], queryFn: () => ep.getMeet(id) });
export function useCreateMeet() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: CreateMeetDto) => ep.createMeet(b), onSuccess: () => qc.invalidateQueries({ queryKey: ['meets'] }) });
}
export function useDeleteMeet() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => ep.deleteMeet(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['meets'] }) });
}
export function useAddRaceEvent(meetId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: CreateRaceEventDto) => ep.addRaceEvent(meetId, b), onSuccess: () => qc.invalidateQueries({ queryKey: ['meet', meetId] }) });
}
export function useDeleteRaceEvent(meetId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (eid: string) => ep.deleteRaceEvent(eid), onSuccess: () => qc.invalidateQueries({ queryKey: ['meet', meetId] }) });
}
export const useEntries = (eventId: string | null) =>
  useQuery({ queryKey: ['entries', eventId], queryFn: () => ep.listEntries(eventId!), enabled: !!eventId });
export const useStandings = (eventId: string | null) =>
  useQuery({ queryKey: ['standings', eventId], queryFn: () => ep.getStandings(eventId!), enabled: !!eventId });
export function useAddEntry(eventId: string, meetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateEntryDto) => ep.addEntry(eventId, b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries', eventId] });
      qc.invalidateQueries({ queryKey: ['standings', eventId] });
      qc.invalidateQueries({ queryKey: ['meet', meetId] });
    },
  });
}
export function useSetResult(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ enid, b }: { enid: string; b: SetResultDto }) => ep.setEntryResult(enid, b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries', eventId] });
      qc.invalidateQueries({ queryKey: ['standings', eventId] });
    },
  });
}
export function useSeedEvent(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => ep.seedEvent(eventId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entries', eventId] }),
  });
}

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
