import { it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw';
import { api, setRedirectToLogin } from './client';
import { useAuthStore } from '../auth-store';

beforeEach(() => {
  useAuthStore.getState().clear();
});

it('有 token 时注入 Authorization 头', async () => {
  useAuthStore.getState().setAuth('tok123', { id: 's1', email: 's@x.com', role: 'SWIMMER' });
  let seen: string | null = null;
  server.use(
    http.get('/api/ping', ({ request }) => {
      seen = request.headers.get('authorization');
      return HttpResponse.json({ ok: true });
    }),
  );
  await api.get('/ping');
  expect(seen).toBe('Bearer tok123');
});

it('401 时清登录态并触发重定向', async () => {
  useAuthStore.getState().setAuth('tok', { id: 's1', email: 's@x.com', role: 'SWIMMER' });
  const redirect = vi.fn();
  setRedirectToLogin(redirect);
  server.use(http.get('/api/secure', () => new HttpResponse(null, { status: 401 })));
  await expect(api.get('/secure')).rejects.toBeTruthy();
  expect(useAuthStore.getState().token).toBeNull();
  expect(redirect).toHaveBeenCalled();
});
