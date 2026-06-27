import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSessionDto } from '@swim/shared';
import * as ep from './api/endpoints';

export const queryKeys = {
  myPools: ['myPools'] as const,
  mySummary: ['mySummary'] as const,
  myHeatmap: (year: number) => ['myHeatmap', year] as const,
  mySessions: ['mySessions'] as const,
  myChallenges: ['myChallenges'] as const,
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
export const useMySessions = () => useQuery({ queryKey: queryKeys.mySessions, queryFn: ep.getMySessions });

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
