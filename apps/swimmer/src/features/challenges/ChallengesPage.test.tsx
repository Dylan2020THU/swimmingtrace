import { it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { ChallengesPage } from './ChallengesPage';

it('展示我的进行中挑战与名次', async () => {
  server.use(
    http.get('/api/me/challenges', () =>
      HttpResponse.json([
        {
          id: 'c1', poolId: 'p1', poolName: '晨曦泳池', name: '夏季挑战',
          goalDistanceMeters: 10000, totalDistanceMeters: 4000, myDistanceMeters: 1500, myRank: 2,
          startDate: '2026-06-01T00:00:00.000Z', endDate: '2026-07-01T00:00:00.000Z',
        },
      ]),
    ),
  );
  renderWithProviders(<Routes><Route path="/challenges" element={<ChallengesPage />} /></Routes>, { route: '/challenges' });
  expect(await screen.findByText(/夏季挑战/)).toBeInTheDocument();
  expect(screen.getByText('1500')).toBeInTheDocument();
});
