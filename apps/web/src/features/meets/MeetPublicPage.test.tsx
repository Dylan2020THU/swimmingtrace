import { it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { MeetPublicPage } from './MeetPublicPage';

it('公开页：渲染赛程，选项目看出发名单与成绩', async () => {
  server.use(
    http.get('/api/public/meets/m1', () =>
      HttpResponse.json({
        id: 'm1', name: '公开赛', meetDate: '2026-06-30T00:00:00.000Z',
        hostPoolName: 'P', laneCount: 6,
        events: [{ id: 'e1', distanceMeters: 50, stroke: 'FREE', order: 0, entryCount: 1 }],
      })),
    http.get('/api/public/events/e1/startlist', () => HttpResponse.json([{ heat: 1, entries: [{ lane: 3, name: 'Sam', seedTimeMs: 28760 }] }])),
    http.get('/api/public/events/e1/results', () =>
      HttpResponse.json([{ gender: 'MALE', ageGroup: '13-14', rows: [{ rank: 1, medal: 'gold', swimmerId: 'a', name: 'Sam', resultTimeMs: 28760, resultStatus: 'OK' }] }])),
  );

  renderWithProviders(<Routes><Route path="/p/meets/:meetId" element={<MeetPublicPage />} /></Routes>, { route: '/p/meets/m1' });
  expect(await screen.findByText('公开赛')).toBeInTheDocument();
  await userEvent.click(await screen.findByRole('button', { name: /50m 自由泳/ }));
  expect(await screen.findByText('第 1 组')).toBeInTheDocument();
  expect(await screen.findByText(/金 1/)).toBeInTheDocument();
});
