import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// 默认 handlers：返回最小合法数据；具体测试用 server.use(...) 覆盖。
export const handlers = [
  http.post('/api/auth/login', () => HttpResponse.json({ accessToken: 'test-token' })),
  http.get('/api/auth/me', () => HttpResponse.json({ id: 'o1', email: 'owner@x.com', role: 'OWNER' })),
  http.get('/api/pools', () => HttpResponse.json([])),
  http.get('/api/challenges/active', () => HttpResponse.json([])),
  http.get('/api/stats/overview', () =>
    HttpResponse.json({ poolCount: 0, memberCount: 0, activeMemberCount: 0, mileageThisMonthMeters: 0, sessionsThisMonth: 0 })),
  http.post('/api/auth/forgot-password', () => HttpResponse.json({ ok: true })),
  http.post('/api/auth/reset-password', () => HttpResponse.json({ ok: true })),
  http.post('/api/auth/verify-email', () => HttpResponse.json({ ok: true })),
  http.post('/api/auth/resend-verification', () => HttpResponse.json({ ok: true })),
  http.get('/api/pools/:id/swimmers', () => HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 20 })),
  http.get('/api/account/plan', () =>
    HttpResponse.json({ plan: 'FREE', limits: { maxPools: 1, maxMembers: 25 }, usage: { pools: 0, members: 0 }, features: { export: false, challenges: false, apiKeys: false } })),
  http.get('/api/api-keys', () => HttpResponse.json([])),
];

export const server = setupServer(...handlers);
