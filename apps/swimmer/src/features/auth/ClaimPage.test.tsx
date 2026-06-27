import { it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { ClaimPage } from './ClaimPage';
import { useAuthStore } from '../../lib/auth-store';

beforeEach(() => useAuthStore.getState().clear());

it('有效令牌 → 展示邮箱，认领后存 token 跳首页', async () => {
  server.use(
    http.get('/api/auth/claim/tok', () => HttpResponse.json({ name: 'Sam', email: 'sam@x.com' })),
    http.post('/api/auth/claim', () => HttpResponse.json({ accessToken: 'tok-claim' })),
    http.get('/api/auth/me', () => HttpResponse.json({ id: 's1', email: 'sam@x.com', role: 'SWIMMER' })),
  );
  renderWithProviders(
    <Routes>
      <Route path="/claim/:token" element={<ClaimPage />} />
      <Route path="/" element={<div>看板页</div>} />
    </Routes>,
    { route: '/claim/tok' },
  );
  expect(await screen.findByText(/sam@x.com/)).toBeInTheDocument();
  await userEvent.type(screen.getByPlaceholderText(/设置密码/), 'swimmerpw1');
  await userEvent.type(screen.getByPlaceholderText('再次输入'), 'swimmerpw1');
  await userEvent.click(screen.getByRole('button', { name: /认领并登录/ }));
  await waitFor(() => expect(screen.getByText('看板页')).toBeInTheDocument());
  expect(useAuthStore.getState().token).toBe('tok-claim');
});

it('无效令牌 → 显示错误', async () => {
  server.use(http.get('/api/auth/claim/bad', () => new HttpResponse(null, { status: 404 })));
  renderWithProviders(
    <Routes>
      <Route path="/claim/:token" element={<ClaimPage />} />
    </Routes>,
    { route: '/claim/bad' },
  );
  expect(await screen.findByText(/认领链接无效/)).toBeInTheDocument();
});
