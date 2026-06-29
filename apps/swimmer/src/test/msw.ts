import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// Default handlers return minimal valid data; specific tests override via server.use(...).
export const handlers = [
  http.get('/api/auth/me', () => HttpResponse.json({ id: 's1', email: 'sam@x.com', role: 'SWIMMER' })),
  http.get('/api/me/pools', () => HttpResponse.json([])),
  http.get('/api/me/challenges', () => HttpResponse.json([])),
  http.get('/api/places/nearby', () => HttpResponse.json([])),
  http.get('/api/sessions/me', () => HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 20 })),
  http.get('/api/stats/summary', () =>
    HttpResponse.json({ totalDistanceMeters: 0, totalDurationSeconds: 0, sessionCount: 0 }),
  ),
  http.get('/api/stats/heatmap', () => HttpResponse.json([])),
  http.post('/api/auth/forgot-password', () => HttpResponse.json({ ok: true })),
  http.post('/api/auth/reset-password', () => HttpResponse.json({ ok: true })),
];

export const server = setupServer(...handlers);
