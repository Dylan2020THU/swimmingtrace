import { describe, it, expect, vi } from 'vitest';

vi.mock('@uiw/react-heat-map', () => ({ default: () => null }));
vi.mock('recharts', async (orig) => ({ ...(await orig() as object), ResponsiveContainer: ({ children }: any) => children }));
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { PoolDetailPage } from './PoolDetailPage';

const detail = { id: 'p1', name: 'Sunrise', address: '街 1 号', latitude: null, longitude: null, archivedAt: null, memberCount: 2, createdAt: '2026-01-01T00:00:00.000Z' };

function mountAt(route = '/pools/p1') {
  server.use(
    http.get('/api/pools/p1', () => HttpResponse.json(detail)),
    http.get('/api/pools/p1/swimmers', () => HttpResponse.json([])),
    http.get('/api/stats/pool/p1', () => HttpResponse.json({ memberCount: 2, activeMemberCount: 2, mileageThisMonthMeters: 0, trend: [], heatmap: [] })),
  );
  return renderWithProviders(
    <Routes>
      <Route path="/pools" element={<div>总览页</div>} />
      <Route path="/pools/:poolId" element={<PoolDetailPage />} />
    </Routes>,
    { route },
  );
}

it('展示泳池信息', async () => {
  mountAt();
  expect(await screen.findByText('Sunrise')).toBeInTheDocument();
  expect(screen.getByText('街 1 号')).toBeInTheDocument();
});

it('归档后返回总览', async () => {
  server.use(http.post('/api/pools/p1/archive', () => HttpResponse.json({ id: 'p1', archivedAt: '2026-06-01T00:00:00.000Z' })));
  mountAt();
  await screen.findByText('Sunrise');
  await userEvent.click(screen.getByRole('button', { name: /归档/ }));
  await userEvent.click(await screen.findByRole('button', { name: /确 定|确定/ }));
  await waitFor(() => expect(screen.getByText('总览页')).toBeInTheDocument());
});
