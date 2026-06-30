import { it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { MyRecordsPage } from './MyRecordsPage';

it('展示每项目 PB，赛会纪录加徽标', async () => {
  server.use(
    http.get('/api/me/records', () =>
      HttpResponse.json([
        { distanceMeters: 50, stroke: 'FREE', timeMs: 30000, meetName: '夏季赛', meetDate: '2026-02-01T00:00:00.000Z', isClubRecord: true },
        { distanceMeters: 100, stroke: 'BACK', timeMs: 75000, meetName: '冬季赛', meetDate: '2026-12-01T00:00:00.000Z', isClubRecord: false },
      ])),
  );
  renderWithProviders(<Routes><Route path="/records" element={<MyRecordsPage />} /></Routes>, { route: '/records' });

  expect(await screen.findByText('30.00')).toBeInTheDocument(); // 50m PB time
  expect(screen.getByText('1:15.00')).toBeInTheDocument(); // 100m PB time
  expect(screen.getByText('夏季赛')).toBeInTheDocument();
  expect(screen.getByText('冬季赛')).toBeInTheDocument();
  expect(screen.getByText('🏆 赛会纪录')).toBeInTheDocument(); // club-record badge on the 50m PB
});
