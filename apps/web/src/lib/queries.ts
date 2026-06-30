import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePoolDto, UpdatePoolDto, CreateSwimmerDto, UpdateMembershipDto, CreateSessionDto, CreateChallengeDto, Plan,
  CreateMeetDto, CreateRaceEventDto, CreateEntryDto, SetResultDto, CreateSeasonDto,
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
export function usePublishMeet(meetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (published: boolean) => ep.publishMeet(meetId, published),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meet', meetId] }); qc.invalidateQueries({ queryKey: ['meets'] }); },
  });
}
export function useSetMeetRegistration(meetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (registrationOpen: boolean) => ep.setMeetRegistration(meetId, registrationOpen),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meet', meetId] }); qc.invalidateQueries({ queryKey: ['meets'] }); },
  });
}
// seasons & records (E5)
export const useSeasons = () => useQuery({ queryKey: ['seasons'], queryFn: ep.listSeasons });
export const useSeason = (id: string) => useQuery({ queryKey: ['season', id], queryFn: () => ep.getSeason(id) });
export const useRecords = () => useQuery({ queryKey: ['records'], queryFn: ep.getRecords });
export function useCreateSeason() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: CreateSeasonDto) => ep.createSeason(b), onSuccess: () => qc.invalidateQueries({ queryKey: ['seasons'] }) });
}
export function useDeleteSeason() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => ep.deleteSeason(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['seasons'] }) });
}
export function usePublishSeason(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (published: boolean) => ep.publishSeason(id, published),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['season', id] }); qc.invalidateQueries({ queryKey: ['seasons'] }); },
  });
}
export function useSetMeetSeason(meetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (seasonId: string | null) => ep.setMeetSeason(meetId, seasonId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meet', meetId] }); qc.invalidateQueries({ queryKey: ['meets'] }); qc.invalidateQueries({ queryKey: ['seasons'] }); },
  });
}
export const usePublicSeason = (id: string) => useQuery({ queryKey: ['publicSeason', id], queryFn: () => ep.getPublicSeason(id), retry: false });
export const usePublicSeasonRecords = (id: string) => useQuery({ queryKey: ['publicSeasonRecords', id], queryFn: () => ep.getPublicSeasonRecords(id), retry: false });

export const usePublicMeet = (id: string) => useQuery({ queryKey: ['publicMeet', id], queryFn: () => ep.getPublicMeet(id), retry: false });
export const usePublicStartList = (eid: string | null) =>
  useQuery({ queryKey: ['publicStartList', eid], queryFn: () => ep.getPublicStartList(eid!), enabled: !!eid });
export const usePublicResults = (eid: string | null) =>
  useQuery({ queryKey: ['publicResults', eid], queryFn: () => ep.getPublicResults(eid!), enabled: !!eid });

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
export const useSwimmers = (poolId: string, page = 1, filter?: ep.RosterFilter) =>
  useQuery({ queryKey: [...queryKeys.swimmers(poolId), page, filter ?? null], queryFn: () => ep.listSwimmers(poolId, page, filter) });
export const useOverview = () => useQuery({ queryKey: queryKeys.overview, queryFn: ep.getOverview });
export const usePoolStats = (id: string) => useQuery({ queryKey: queryKeys.poolStats(id), queryFn: () => ep.getPoolStats(id) });
export const useSwimmerStats = (sid: string, year?: number) =>
  useQuery({ queryKey: [...queryKeys.swimmerStats(sid), year ?? null], queryFn: () => ep.getSwimmerStats(sid, year) });
export const useMemberProfile = (sid: string) =>
  useQuery({ queryKey: ['memberProfile', sid], queryFn: () => ep.getMemberProfile(sid) });
export const useMemberSessions = (sid: string, year: number) =>
  useInfiniteQuery({
    queryKey: ['memberSessions', sid, year],
    queryFn: ({ pageParam }) => ep.getMemberSessions(sid, year, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });

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
