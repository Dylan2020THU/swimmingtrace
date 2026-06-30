import { it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { SeasonPublicPage } from './SeasonPublicPage';

const route = '/p/seasons/s1';
const render = () =>
  renderWithProviders(<Routes><Route path="/p/seasons/:seasonId" element={<SeasonPublicPage />} /></Routes>, { route });

it('公开赛季页展示积分榜 + 纪录板', async () => {
  server.use(
    http.get('/api/public/seasons/s1', () =>
      HttpResponse.json({ id: 's1', name: '2026春季系列赛', standings: [{ gender: 'MALE', ageGroup: '13-14', rows: [{ rank: 1, swimmerId: 'a', name: 'Ada', points: 18 }] }] })),
    http.get('/api/public/seasons/s1/records', () =>
      HttpResponse.json([{ distanceMeters: 50, stroke: 'FREE', gender: 'MALE', ageGroup: '13-14', swimmerId: 'a', name: 'Ada', timeMs: 30000, meetName: '夏季赛', meetDate: '2026-02-01T00:00:00.000Z' }])),
  );
  render();
  expect(await screen.findByText('2026春季系列赛')).toBeInTheDocument();
  expect(await screen.findByText('18')).toBeInTheDocument(); // standings points (unique)
  expect(await screen.findByText('50m 自由泳')).toBeInTheDocument(); // records row (unique)
  expect(screen.getByText('夏季赛')).toBeInTheDocument(); // record meet name
});

it('未公开赛季 → 404 兜底', async () => {
  server.use(http.get('/api/public/seasons/s1', () => new HttpResponse(null, { status: 404 })));
  render();
  expect(await screen.findByText('赛季不存在或未公开')).toBeInTheDocument();
});
