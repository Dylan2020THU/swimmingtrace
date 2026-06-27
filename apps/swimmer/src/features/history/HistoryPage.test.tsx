import { it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { HistoryPage } from './HistoryPage';

it('展示游泳历史', async () => {
  server.use(
    http.get('/api/sessions/me', () =>
      HttpResponse.json([
        { id: 's1', poolId: 'p1', distanceMeters: 1500, durationSeconds: 1200, swamAt: '2026-03-01T08:00:00.000Z' },
      ]),
    ),
  );
  renderWithProviders(
    <Routes>
      <Route path="/history" element={<HistoryPage />} />
    </Routes>,
    { route: '/history' },
  );
  expect(await screen.findByText('1500 米')).toBeInTheDocument();
});
