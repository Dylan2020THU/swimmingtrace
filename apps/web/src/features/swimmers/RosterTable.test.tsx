import { it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { RosterTable } from './RosterTable';

const sam = { swimmerId: 's1', name: 'Sam', email: 'sam@x.com', status: 'ACTIVE', claimedAt: null, mileageLast30dMeters: 700, joinedAt: '2026-02-01T00:00:00.000Z' };
const page = <T,>(items: T[], total = items.length, p = 1) => ({ items, total, page: p, pageSize: 20 });

it('展示会员并能新建会员', async () => {
  let created = false;
  server.use(
    http.get('/api/pools/p1/swimmers', () =>
      HttpResponse.json(created ? page([sam, { ...sam, swimmerId: 's2', name: 'Mei', email: 'mei@x.com' }]) : page([sam]))),
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

it('搜索：onSearch 发起带 q 参数的服务端请求', async () => {
  let lastQ: string | null = null;
  server.use(
    http.get('/api/pools/p1/swimmers', ({ request }) => {
      lastQ = new URL(request.url).searchParams.get('q');
      return HttpResponse.json(page([sam]));
    }),
  );
  renderWithProviders(<Routes><Route path="*" element={<RosterTable poolId="p1" />} /></Routes>, { route: '/pools/p1' });
  await screen.findByText('Sam');
  await userEvent.type(screen.getByPlaceholderText('姓名/邮箱'), 'sam{enter}');
  await waitFor(() => expect(lastQ).toBe('sam'));
});

it('服务端分页：切换页码请求下一页并展示其数据', async () => {
  server.use(
    http.get('/api/pools/p1/swimmers', ({ request }) => {
      const p = Number(new URL(request.url).searchParams.get('page') ?? '1');
      const item = (n: number) => ({ ...sam, swimmerId: `s${n}`, name: `游泳者${n}`, email: `s${n}@x.com` });
      return HttpResponse.json(page([item(p)], 21, p));
    }),
  );
  renderWithProviders(<Routes><Route path="*" element={<RosterTable poolId="p1" />} /></Routes>, { route: '/pools/p1' });
  expect(await screen.findByText('游泳者1')).toBeInTheDocument();
  await userEvent.click(screen.getByTitle('2'));
  await waitFor(() => expect(screen.getByText('游泳者2')).toBeInTheDocument());
});
