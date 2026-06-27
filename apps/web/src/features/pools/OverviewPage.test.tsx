import { it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { OverviewPage } from './OverviewPage';

const overview = { poolCount: 1, memberCount: 3, activeMemberCount: 2, mileageThisMonthMeters: 5000, sessionsThisMonth: 4 };
const pool = { id: 'p1', name: 'Sunrise', address: null, latitude: null, longitude: null, memberCount: 3, mileageLast30dMeters: 1200, archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z' };

it('展示汇总卡与泳池列表', async () => {
  server.use(
    http.get('/api/stats/overview', () => HttpResponse.json(overview)),
    http.get('/api/pools', () => HttpResponse.json([pool])),
  );
  renderWithProviders(<Routes><Route path="/pools" element={<OverviewPage />} /></Routes>, { route: '/pools' });
  expect(await screen.findByText('Sunrise')).toBeInTheDocument();
  expect(screen.getByText('5000')).toBeInTheDocument(); // 本月里程
});

it('新建泳池：提交后刷新列表', async () => {
  let created = false;
  server.use(
    http.get('/api/stats/overview', () => HttpResponse.json(overview)),
    http.get('/api/pools', () => HttpResponse.json(created ? [pool, { ...pool, id: 'p2', name: 'Moonlight' }] : [pool])),
    http.post('/api/pools', async () => { created = true; return HttpResponse.json({ id: 'p2', name: 'Moonlight' }); }),
  );
  renderWithProviders(<Routes><Route path="/pools" element={<OverviewPage />} /></Routes>, { route: '/pools' });
  await screen.findByText('Sunrise');
  await userEvent.click(screen.getByRole('button', { name: /新建泳池/ }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('名称'), 'Moonlight');
  await userEvent.click(within(dialog).getByRole('button', { name: /确定|提交|创建/ }));
  await waitFor(() => expect(screen.getByText('Moonlight')).toBeInTheDocument());
});
