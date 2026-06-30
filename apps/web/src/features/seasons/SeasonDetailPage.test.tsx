import { it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { SeasonDetailPage } from './SeasonDetailPage';

const detail = {
  id: 's1', name: '2026春季系列赛', referenceDate: '2026-01-01T00:00:00.000Z', published: false, meetCount: 2, createdAt: '2026-01-01T00:00:00.000Z',
  meets: [{ id: 'm1', name: 'M1', meetDate: '2026-02-01T00:00:00.000Z' }],
  standings: [{ gender: 'MALE', ageGroup: '13-14', rows: [
    { rank: 1, swimmerId: 'a', name: 'Ada', points: 18 },
    { rank: 2, swimmerId: 'b', name: 'Ben', points: 14 },
  ] }],
};

it('展示赛季积分榜（性别/年龄组 + 积分），开关触发发布', async () => {
  let body: any = null;
  server.use(
    http.get('/api/seasons/s1', () => HttpResponse.json(detail)),
    http.post('/api/seasons/s1/publish', async ({ request }) => { body = await request.json(); return HttpResponse.json({ published: true }); }),
  );

  renderWithProviders(<Routes><Route path="/seasons/:seasonId" element={<SeasonDetailPage />} /></Routes>, { route: '/seasons/s1' });

  expect(await screen.findByText('2026春季系列赛')).toBeInTheDocument();
  expect(await screen.findByText('男 · 13-14')).toBeInTheDocument();
  expect(screen.getByText('Ada')).toBeInTheDocument();
  expect(screen.getByText('18')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('switch'));
  await waitFor(() => expect(body).toEqual({ published: true }));
});
