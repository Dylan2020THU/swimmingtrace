import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';

vi.mock('@uiw/react-heat-map', () => ({ default: () => null }));
vi.mock('recharts', async (orig) => ({ ...(await orig() as object), ResponsiveContainer: ({ children }: any) => children }));
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { PoolDashboard } from './PoolDashboard';

it('展示本泳池统计', async () => {
  server.use(http.get('/api/stats/pool/p1', () => HttpResponse.json({
    memberCount: 5, activeMemberCount: 4, mileageThisMonthMeters: 8000,
    trend: [{ date: '2026-02-01', distanceMeters: 1000 }],
    heatmap: [{ date: '2026-02-01', distanceMeters: 1000 }],
  })));
  renderWithProviders(<PoolDashboard poolId="p1" />);
  expect(await screen.findByText('8000')).toBeInTheDocument(); // 本月里程
  expect(screen.getByText('本月里程(米)')).toBeInTheDocument();
});
