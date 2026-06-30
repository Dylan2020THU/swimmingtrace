import { it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { SwimmerStatsPage } from './SwimmerStatsPage';

it('渲染会员训练概览 + 热力图', async () => {
  server.use(
    http.get('/api/stats/swimmer/s1', () =>
      HttpResponse.json({
        summary: { totalDistanceMeters: 12345, totalDurationSeconds: 6000, sessionCount: 9 },
        heatmap: [{ date: '2026-02-01', distanceMeters: 1000 }],
      })),
  );
  renderWithProviders(<Routes><Route path="/swimmers/:sid" element={<SwimmerStatsPage />} /></Routes>, { route: '/swimmers/s1' });
  expect(await screen.findByText('12345')).toBeInTheDocument();
  expect(screen.getByText('9')).toBeInTheDocument();
  expect(screen.getByText('会员训练概览')).toBeInTheDocument();
});
