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
