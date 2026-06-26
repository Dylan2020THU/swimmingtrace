import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { RosterTable } from './RosterTable';

const sam = { swimmerId: 's1', name: 'Sam', email: 'sam@x.com', status: 'ACTIVE', claimedAt: null, mileageLast30dMeters: 700, joinedAt: '2026-02-01T00:00:00.000Z' };

it('展示会员并能新建会员', async () => {
  let created = false;
  server.use(
    http.get('/api/pools/p1/swimmers', () => HttpResponse.json(created ? [sam, { ...sam, swimmerId: 's2', name: 'Mei', email: 'mei@x.com' }] : [sam])),
    http.post('/api/pools/p1/swimmers', async () => { created = true; return HttpResponse.json({ ...sam, swimmerId: 's2', name: 'Mei', email: 'mei@x.com' }); }),
  );
  renderWithProviders(<Routes><Route path="*" element={<RosterTable poolId="p1" />} /></Routes>, { route: '/pools/p1' });
  expect(await screen.findByText('Sam')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /新建会员/ }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('邮箱'), 'mei@x.com');
  await userEvent.type(within(dialog).getByLabelText('姓名'), 'Mei');
  await userEvent.click(within(dialog).getByRole('button', { name: /确定|创建/ }));
  await waitFor(() => expect(screen.getByText('Mei')).toBeInTheDocument());
});
