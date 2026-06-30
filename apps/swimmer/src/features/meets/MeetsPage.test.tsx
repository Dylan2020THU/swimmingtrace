import { it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { MeetsPage } from './MeetsPage';

// antd-mobile Popup stays mid-transition (pointer-events:none) in jsdom — skip the pointer check.
const user = userEvent.setup({ pointerEventsCheck: 0 });
const render = () =>
  renderWithProviders(<Routes><Route path="/meets" element={<MeetsPage />} /></Routes>, { route: '/meets' });

it('列出开放赛事，报名弹窗确认后 POST 自助报名', async () => {
  let posted = false;
  server.use(
    http.get('/api/me/meets', () =>
      HttpResponse.json([
        { id: 'm1', name: '夏季赛', meetDate: '2026-08-01T00:00:00.000Z', hostPoolName: '晨曦',
          events: [{ id: 'e1', distanceMeters: 50, stroke: 'FREE', order: 0, myEntryId: null, mySeedTimeMs: null }] },
      ])),
    http.post('/api/me/meets/events/e1/entries', () => { posted = true; return HttpResponse.json({ id: 'en1', swimmerId: 's1' }); }),
  );

  render();
  expect(await screen.findByText('夏季赛')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /^报\s*名$/ }));
  await user.click(await screen.findByRole('button', { name: /确认报名/ }));
  await waitFor(() => expect(posted).toBe(true));
});

it('已报名项目展示种子成绩与「撤回」，点击触发 DELETE', async () => {
  let deleted = false;
  server.use(
    http.get('/api/me/meets', () =>
      HttpResponse.json([
        { id: 'm1', name: '冬季赛', meetDate: '2026-12-01T00:00:00.000Z', hostPoolName: null,
          events: [{ id: 'e1', distanceMeters: 100, stroke: 'BACK', order: 0, myEntryId: 'en1', mySeedTimeMs: 62340 }] },
      ])),
    http.delete('/api/me/meets/entries/en1', () => { deleted = true; return HttpResponse.json({ ok: true }); }),
  );

  render();
  expect(await screen.findByText(/已报名/)).toBeInTheDocument();
  expect(screen.getByText(/1:02\.34/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /撤\s*回/ }));
  await waitFor(() => expect(deleted).toBe(true));
});

it('缺资料报名 422 → 弹出「完善资料」', async () => {
  server.use(
    http.get('/api/me/meets', () =>
      HttpResponse.json([
        { id: 'm1', name: '春季赛', meetDate: '2026-03-01T00:00:00.000Z', hostPoolName: null,
          events: [{ id: 'e1', distanceMeters: 50, stroke: 'FREE', order: 0, myEntryId: null, mySeedTimeMs: null }] },
      ])),
    http.post('/api/me/meets/events/e1/entries', () => HttpResponse.json({ message: '请先在「我的资料」补全性别与出生日期' }, { status: 422 })),
  );

  render();
  await screen.findByText('春季赛');
  await user.click(screen.getByRole('button', { name: /^报\s*名$/ }));
  await user.click(await screen.findByRole('button', { name: /确认报名/ }));
  expect(await screen.findByRole('heading', { name: '完善资料' })).toBeInTheDocument();
});
