import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// Default handlers return minimal valid data; specific tests override via server.use(...).
export const handlers = [
  http.get('/api/auth/me', () => HttpResponse.json({ id: 's1', email: 'sam@x.com', role: 'SWIMMER' })),
  http.get('/api/me/pools', () => HttpResponse.json([])),
  http.get('/api/me/challenges', () => HttpResponse.json([])),
  http.get('/api/sessions/me', () => HttpResponse.json([])),
  http.get('/api/stats/summary', () =>
    HttpResponse.json({ totalDistanceMeters: 0, totalDurationSeconds: 0, sessionCount: 0 }),
  ),
  http.get('/api/stats/heatmap', () => HttpResponse.json([])),
];

export const server = setupServer(...handlers);
