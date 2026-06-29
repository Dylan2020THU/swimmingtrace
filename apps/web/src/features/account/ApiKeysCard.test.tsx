import { it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { ApiKeysCard } from './ApiKeysCard';

const proPlan = {
  plan: 'PRO',
  limits: { maxPools: 20, maxMembers: 1000 },
  usage: { pools: 0, members: 0 },
  features: { export: true, challenges: true, apiKeys: true },
};

it('Pro：新建 key 显示明文一次，并以 label 调 POST', async () => {
  let body: unknown = null;
  server.use(
    http.get('/api/account/plan', () => HttpResponse.json(proPlan)),
    http.get('/api/api-keys', () => HttpResponse.json([])),
    http.post('/api/api-keys', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ id: 'k1', label: 'CI', prefix: 'swk_abcdef12', key: 'swk_secretPLAINTEXT', createdAt: '2026-06-30T00:00:00.000Z' });
    }),
  );
  renderWithProviders(<ApiKeysCard />);
  await userEvent.click(await screen.findByRole('button', { name: /新\s*建/ }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByPlaceholderText(/标签/), 'CI');
  await userEvent.click(within(dialog).getByRole('button', { name: /创\s*建/ }));
  await waitFor(() => expect(body).toEqual({ label: 'CI' }));
  expect(await screen.findByDisplayValue('swk_secretPLAINTEXT')).toBeInTheDocument();
});

it('Pro：列表展示已有 key 并能撤销', async () => {
  let deleted: string | null = null;
  server.use(
    http.get('/api/account/plan', () => HttpResponse.json(proPlan)),
    http.get('/api/api-keys', () =>
      HttpResponse.json([{ id: 'k1', label: 'CI', prefix: 'swk_abcdef12', lastUsedAt: null, createdAt: '2026-06-30T00:00:00.000Z' }])),
    http.delete('/api/api-keys/k1', () => {
      deleted = 'k1';
      return HttpResponse.json({ ok: true });
    }),
  );
  renderWithProviders(<ApiKeysCard />);
  expect(await screen.findByText(/CI · swk_abcdef12/)).toBeInTheDocument();
  await userEvent.click(screen.getByText('撤销'));
  await userEvent.click(await screen.findByRole('button', { name: '确认撤销' }));
  await waitFor(() => expect(deleted).toBe('k1'));
});
