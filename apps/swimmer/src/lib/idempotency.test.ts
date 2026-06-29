import { it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/msw';
import { recordMySession } from './api/endpoints';

it('recordMySession 携带 Idempotency-Key 头', async () => {
  let captured: string | null = null;
  server.use(
    http.post('/api/sessions', ({ request }) => {
      captured = request.headers.get('idempotency-key');
      return HttpResponse.json({ id: 's1' });
    }),
  );
  await recordMySession({ distanceMeters: 100, swamAt: '2026-04-01T00:00:00.000Z' });
  expect(captured).toBeTruthy();
});
