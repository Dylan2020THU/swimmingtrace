import { it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { ActiveChallengesBanner } from './ActiveChallengesBanner';

const ch = {
  id: 'c1', poolId: 'p1', poolName: '晨曦泳池', name: '夏季挑战',
  goalDistanceMeters: 10000, totalDistanceMeters: 3000,
  startDate: '2026-06-01T00:00:00.000Z', endDate: '2026-07-01T00:00:00.000Z',
};

it('有进行中挑战 → 渲染区块', async () => {
  server.use(http.get('/api/challenges/active', () => HttpResponse.json([ch])));
  renderWithProviders(<Routes><Route path="/" element={<ActiveChallengesBanner />} /></Routes>, { route: '/' });
  expect(await screen.findByText(/夏季挑战/)).toBeInTheDocument();
  expect(screen.getByText('进行中的挑战', { exact: false })).toBeInTheDocument();
});

it('无进行中挑战 → 不渲染', async () => {
  server.use(http.get('/api/challenges/active', () => HttpResponse.json([])));
  renderWithProviders(<Routes><Route path="/" element={<ActiveChallengesBanner />} /></Routes>, { route: '/' });
  await waitFor(() => expect(screen.queryByText('进行中的挑战', { exact: false })).not.toBeInTheDocument());
});
