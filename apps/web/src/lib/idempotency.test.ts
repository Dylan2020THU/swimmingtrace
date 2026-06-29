import { it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/msw';
import { recordSession } from './api/endpoints';

it('recordSession 携带 Idempotency-Key 头', async () => {
  let captured: string | null = null;
  server.use(
    http.post('/api/pools/p1/swimmers/s1/sessions', ({ request }) => {
      captured = request.headers.get('idempotency-key');
      return HttpResponse.json({ id: 'x' });
    }),
  );
  await recordSession('p1', 's1', { distanceMeters: 100, swamAt: '2026-04-01T00:00:00.000Z' });
  expect(captured).toBeTruthy();
});
