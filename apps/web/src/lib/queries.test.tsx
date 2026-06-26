import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../test/msw';
import { usePools } from './queries';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('usePools', () => {
  it('拉取泳池列表', async () => {
    server.use(http.get('/api/pools', () => HttpResponse.json([
      { id: 'p1', name: 'A', address: null, latitude: null, longitude: null, memberCount: 2, mileageLast30dMeters: 100, archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z' },
    ])));
    const { result } = renderHook(() => usePools(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].name).toBe('A');
  });
});
