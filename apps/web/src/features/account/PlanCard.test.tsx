import { it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { PlanCard } from './PlanCard';

it('展示当前计划并能升级到 Pro', async () => {
  let body: unknown = null;
  let plan = 'FREE';
  const info = () => ({
    plan,
    limits: { maxPools: plan === 'PRO' ? 20 : 1, maxMembers: plan === 'PRO' ? 1000 : 25 },
    usage: { pools: 0, members: 0 },
    features: { export: plan === 'PRO', challenges: plan === 'PRO' },
  });
  server.use(
    http.get('/api/account/plan', () => HttpResponse.json(info())),
    http.post('/api/account/plan', async ({ request }) => {
      body = await request.json();
      plan = (body as { plan: string }).plan;
      return HttpResponse.json(info());
    }),
  );

  renderWithProviders(<PlanCard />);
  expect(await screen.findByText('FREE')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '升级到 Pro' }));
  await waitFor(() => expect(body).toEqual({ plan: 'PRO' }));
  await waitFor(() => expect(screen.getByText('PRO')).toBeInTheDocument());
});
