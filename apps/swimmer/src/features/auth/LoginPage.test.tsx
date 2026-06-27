import { it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { LoginPage } from './LoginPage';
import { useAuthStore } from '../../lib/auth-store';

beforeEach(() => useAuthStore.getState().clear());

it('登录成功 → 存 token 并跳首页', async () => {
  server.use(
    http.post('/api/auth/login', () => HttpResponse.json({ accessToken: 'tok-login' })),
    http.get('/api/auth/me', () => HttpResponse.json({ id: 's1', email: 's@x.com', role: 'SWIMMER' })),
  );
  renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<div>看板页</div>} />
    </Routes>,
    { route: '/login' },
  );
  await userEvent.type(screen.getByPlaceholderText('邮箱'), 's@x.com');
  await userEvent.type(screen.getByPlaceholderText(/密码/), 'password123');
  await userEvent.click(screen.getByRole('button', { name: '登录' }));
  await waitFor(() => expect(screen.getByText('看板页')).toBeInTheDocument());
  expect(useAuthStore.getState().token).toBe('tok-login');
});
