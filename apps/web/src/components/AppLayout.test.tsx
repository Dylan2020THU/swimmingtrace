import { it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../test/msw';
import { renderWithProviders } from '../test/render';
import { AppLayout } from './AppLayout';
import { useAuthStore } from '../lib/auth-store';

beforeEach(() => useAuthStore.getState().setAuth('tok', { id: 'o1', email: 'owner@x.com', role: 'OWNER' }));

it('渲染用户邮箱，登出后跳登录', async () => {
  server.use(http.get('/api/pools', () => HttpResponse.json([])));
  renderWithProviders(
    <Routes>
      <Route element={<AppLayout />}><Route path="/pools" element={<div>内容</div>} /></Route>
      <Route path="/login" element={<div>登录页</div>} />
    </Routes>,
    { route: '/pools' },
  );
  expect(await screen.findByText('owner@x.com')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /登出/ }));
  await waitFor(() => expect(screen.getByText('登录页')).toBeInTheDocument());
  expect(useAuthStore.getState().token).toBeNull();
});

it('有进行中挑战 → 顶栏显示「赛事进行中」徽标', async () => {
  server.use(
    http.get('/api/pools', () => HttpResponse.json([])),
    http.get('/api/challenges/active', () =>
      HttpResponse.json([
        { id: 'c1', poolId: 'p1', poolName: '晨曦', name: '夏挑', goalDistanceMeters: 10000, totalDistanceMeters: 1000, startDate: '2026-06-01T00:00:00.000Z', endDate: '2026-07-01T00:00:00.000Z' },
      ]),
    ),
  );
  renderWithProviders(
    <Routes>
      <Route element={<AppLayout />}><Route path="/pools" element={<div>内容</div>} /></Route>
    </Routes>,
    { route: '/pools' },
  );
  expect(await screen.findByText('赛事进行中')).toBeInTheDocument();
});
