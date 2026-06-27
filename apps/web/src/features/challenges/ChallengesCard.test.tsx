import { it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { ChallengesCard } from './ChallengesCard';

const ch = {
  id: 'c1', poolId: 'p1', name: '夏季挑战', goalDistanceMeters: 10000,
  startDate: '2026-06-01T00:00:00.000Z', endDate: '2026-07-01T00:00:00.000Z', totalDistanceMeters: 2500,
};

it('展示挑战列表与进度，并能打开新建弹窗', async () => {
  server.use(http.get('/api/pools/p1/challenges', () => HttpResponse.json([ch])));
  renderWithProviders(<Routes><Route path="/" element={<ChallengesCard poolId="p1" />} /></Routes>, { route: '/' });
  expect(await screen.findByText('夏季挑战')).toBeInTheDocument();
  expect(screen.getByText('2500 / 10000 米')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /新建挑战/ }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByLabelText('名称')).toBeInTheDocument();
  expect(within(dialog).getByLabelText('目标里程(米)')).toBeInTheDocument();
});
