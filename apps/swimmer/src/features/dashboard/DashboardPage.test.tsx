import { it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { DashboardPage } from './DashboardPage';

vi.mock('@uiw/react-heat-map', () => ({ default: () => null }));

it('展示个人汇总并能进入录入', async () => {
  server.use(
    http.get('/api/stats/summary', () =>
      HttpResponse.json({ totalDistanceMeters: 5000, totalDurationSeconds: 3600, sessionCount: 4 }),
    ),
    http.get('/api/stats/heatmap', () => HttpResponse.json([{ date: '2026-03-01', distanceMeters: 1000 }])),
  );
  renderWithProviders(
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/record" element={<div>录入页</div>} />
    </Routes>,
    { route: '/' },
  );
  expect(await screen.findByText('5000')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /记录一次游泳/ }));
  await waitFor(() => expect(screen.getByText('录入页')).toBeInTheDocument());
});
