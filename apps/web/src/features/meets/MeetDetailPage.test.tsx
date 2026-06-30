import { it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { MeetDetailPage } from './MeetDetailPage';

it('选项目后展示按性别/年龄组的排行榜（金银名次）', async () => {
  server.use(
    http.get('/api/meets/m1', () =>
      HttpResponse.json({
        id: 'm1', name: '夏季赛', meetDate: '2026-06-30T00:00:00.000Z',
        hostPoolId: null, hostPoolName: null, eventCount: 1, createdAt: '2026-06-30T00:00:00.000Z',
        events: [{ id: 'e1', distanceMeters: 50, stroke: 'FREE', order: 0, entryCount: 2 }],
      })),
    http.get('/api/events/e1/entries', () => HttpResponse.json([])),
    http.get('/api/events/e1/standings', () =>
      HttpResponse.json([
        {
          gender: 'MALE', ageGroup: '13-14',
          rows: [
            { rank: 1, medal: 'gold', swimmerId: 'a', name: 'Sam', resultTimeMs: 30000, resultStatus: 'OK' },
            { rank: 2, medal: 'silver', swimmerId: 'b', name: 'Bob', resultTimeMs: 31000, resultStatus: 'OK' },
          ],
        },
      ])),
  );

  renderWithProviders(<Routes><Route path="/meets/:meetId" element={<MeetDetailPage />} /></Routes>, { route: '/meets/m1' });

  await userEvent.click(await screen.findByRole('button', { name: /50m 自由泳/ }));
  expect(await screen.findByText('男 · 13-14')).toBeInTheDocument();
  expect(screen.getByText('Sam')).toBeInTheDocument();
  expect(screen.getByText('Bob')).toBeInTheDocument();
  expect(screen.getByText(/金 1/)).toBeInTheDocument();
  expect(screen.getByText(/银 2/)).toBeInTheDocument();
});
