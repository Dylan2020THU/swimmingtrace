import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSessionDto, SelfEntryDto, UpdateProfileDto } from '@swim/shared';
import * as ep from './api/endpoints';

export const queryKeys = {
  myPools: ['myPools'] as const,
  mySummary: ['mySummary'] as const,
  myHeatmap: (year: number) => ['myHeatmap', year] as const,
  mySessions: ['mySessions'] as const,
  myChallenges: ['myChallenges'] as const,
  myMeets: ['myMeets'] as const,
};

export const useMyChallenges = () => useQuery({ queryKey: queryKeys.myChallenges, queryFn: ep.getMyChallenges });

export const useNearbyPlaces = (coords: { lat: number; lng: number } | null, radiusMeters = 5000) =>
  useQuery({
    queryKey: ['nearby', coords?.lat, coords?.lng, radiusMeters],
    queryFn: () => ep.getNearbyPlaces(coords!.lat, coords!.lng, radiusMeters),
    enabled: !!coords,
  });

export const useMyPools = () => useQuery({ queryKey: queryKeys.myPools, queryFn: ep.getMyPools });
export const useMySummary = () => useQuery({ queryKey: queryKeys.mySummary, queryFn: ep.getMySummary });
export const useMyHeatmap = (year: number) =>
  useQuery({ queryKey: queryKeys.myHeatmap(year), queryFn: () => ep.getMyHeatmap(year) });
export const useMySessions = () =>
  useInfiniteQuery({
    queryKey: queryKeys.mySessions,
    queryFn: ({ pageParam }) => ep.getMySessions(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });

export function useRecordSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateSessionDto) => ep.recordMySession(b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.mySummary });
      qc.invalidateQueries({ queryKey: queryKeys.mySessions });
      qc.invalidateQueries({ queryKey: ['myHeatmap'] });
    },
  });
}

// self-registration (E4)
export const useMyMeets = () => useQuery({ queryKey: queryKeys.myMeets, queryFn: ep.getMyMeets });

export function useSelfRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, b }: { eventId: string; b: SelfEntryDto }) => ep.selfRegister(eventId, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.myMeets }),
  });
}

export function useWithdrawEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => ep.withdrawEntry(entryId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.myMeets }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: UpdateProfileDto) => ep.updateProfile(b),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.myMeets }),
  });
}
