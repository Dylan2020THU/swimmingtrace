import { it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { RecordPage } from './RecordPage';

it('选池 + 距离 提交 → POST /sessions 并跳首页', async () => {
  let body: any = null;
  server.use(
    http.get('/api/me/pools', () => HttpResponse.json([{ id: 'p1', name: '晨曦泳池' }])),
    http.post('/api/sessions', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ id: 'ss1' });
    }),
  );
  renderWithProviders(
    <Routes>
      <Route path="/record" element={<RecordPage />} />
      <Route path="/" element={<div>看板页</div>} />
    </Routes>,
    { route: '/record' },
  );
  await userEvent.click(await screen.findByText('晨曦泳池'));
  await userEvent.type(screen.getByPlaceholderText('如 1000'), '1200');
  await userEvent.click(screen.getByRole('button', { name: '提交' }));
  await waitFor(() => expect(screen.getByText('看板页')).toBeInTheDocument());
  expect(body.poolId).toBe('p1');
  expect(body.distanceMeters).toBe(1200);
});
