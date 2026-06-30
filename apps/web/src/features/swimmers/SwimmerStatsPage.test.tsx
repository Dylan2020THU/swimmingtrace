import { it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { SwimmerStatsPage } from './SwimmerStatsPage';

const profile = {
  swimmerId: 's1', name: 'Sam', email: 'sam@x.com', gender: 'MALE', birthDate: '2012-03-01T00:00:00.000Z',
  claimedAt: null, createdAt: '2025-06-01T00:00:00.000Z',
  pools: [{ poolId: 'p1', poolName: '晨曦泳池', status: 'ACTIVE', joinedAt: '2026-01-01T00:00:00.000Z' }],
};
const stats = { summary: { totalDistanceMeters: 12345, totalDurationSeconds: 6000, sessionCount: 9 }, heatmap: [{ date: '2026-02-01', distanceMeters: 1000 }] };

const baseHandlers = () => [
  http.get('/api/stats/swimmer/s1/profile', () => HttpResponse.json(profile)),
  http.get('/api/stats/swimmer/s1', () => HttpResponse.json(stats)),
];

const render = () =>
  renderWithProviders(<Routes><Route path="/swimmers/:sid" element={<SwimmerStatsPage />} /></Routes>, { route: '/swimmers/s1' });

it('渲染基本信息 + 概览 + 训练明细（月分组）', async () => {
  server.use(
    ...baseHandlers(),
    http.get('/api/stats/swimmer/s1/sessions', () =>
      HttpResponse.json({
        items: [{ id: 'se1', swamAt: '2026-03-02T08:00:00.000Z', distanceMeters: 1500, durationSeconds: 1800, poolId: 'p1', poolName: '晨曦泳池' }],
        total: 1, page: 1, pageSize: 20,
      })),
  );
  render();
  // basic info
  expect(await screen.findByText('Sam')).toBeInTheDocument();
  expect(screen.getByText('sam@x.com')).toBeInTheDocument();
  expect(screen.getAllByText(/晨曦泳池/).length).toBeGreaterThan(0); // pool membership
  // overview
  expect(screen.getByText('12345')).toBeInTheDocument();
  // training detail (month-grouped)
  expect(await screen.findByText(/2026年3月/)).toBeInTheDocument();
  expect(screen.getByText('1500 米')).toBeInTheDocument();
});

it('切换年份触发带 year 的 sessions 请求', async () => {
  let lastYear: string | null = null;
  server.use(
    ...baseHandlers(),
    http.get('/api/stats/swimmer/s1/sessions', ({ request }) => {
      lastYear = new URL(request.url).searchParams.get('year');
      return HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 20 });
    }),
  );
  render();
  await screen.findByText('Sam');
  await waitFor(() => expect(lastYear).toBe(String(new Date().getFullYear())));
  await userEvent.click(screen.getByRole('combobox'));
  await userEvent.click(await screen.findByText('2025年'));
  await waitFor(() => expect(lastYear).toBe('2025'));
});
