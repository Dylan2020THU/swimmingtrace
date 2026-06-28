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

it('401 → 调 /auth/refresh 续期并重试原请求（并发单飞只刷一次）', async () => {
  useAuthStore.getState().setTokens('old', 'r1');
  let refreshCount = 0;
  server.use(
    http.post('/api/auth/refresh', () => {
      refreshCount += 1;
      return HttpResponse.json({ accessToken: 'new', refreshToken: 'r2' });
    }),
    http.get('/api/secure', ({ request }) =>
      request.headers.get('authorization') === 'Bearer new'
        ? HttpResponse.json({ ok: true })
        : new HttpResponse(null, { status: 401 }),
    ),
  );
  const [a, b] = await Promise.all([api.get('/secure'), api.get('/secure')]);
  expect(a.data).toEqual({ ok: true });
  expect(b.data).toEqual({ ok: true });
  expect(refreshCount).toBe(1);
  expect(useAuthStore.getState().token).toBe('new');
  expect(useAuthStore.getState().refreshToken).toBe('r2');
});

it('refresh 失败 → 清登录态并重定向', async () => {
  useAuthStore.getState().setTokens('old', 'r1');
  const redirect = vi.fn();
  setRedirectToLogin(redirect);
  server.use(
    http.post('/api/auth/refresh', () => new HttpResponse(null, { status: 401 })),
    http.get('/api/secure', () => new HttpResponse(null, { status: 401 })),
  );
  await expect(api.get('/secure')).rejects.toBeTruthy();
  expect(useAuthStore.getState().token).toBeNull();
  expect(redirect).toHaveBeenCalled();
});
