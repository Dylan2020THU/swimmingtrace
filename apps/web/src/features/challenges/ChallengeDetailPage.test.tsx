import { it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { ChallengeDetailPage } from './ChallengeDetailPage';

const lb = [
  { swimmerId: 'a', name: 'Ada', email: 'ada@x.com', distanceMeters: 6000, gender: 'FEMALE', birthDate: '2011-01-01T00:00:00.000Z', sessionCount: 4, status: 'ACTIVE' },
  { swimmerId: 'b', name: 'Ben', email: 'ben@x.com', distanceMeters: 4000, gender: 'MALE', birthDate: '2012-01-01T00:00:00.000Z', sessionCount: 2, status: 'INACTIVE' },
];

const detail = {
  id: 'c1', poolId: 'p1', name: '夏季挑战', goalDistanceMeters: 100000,
  startDate: '2026-06-01T00:00:00.000Z', endDate: '2026-07-01T00:00:00.000Z',
  totalDistanceMeters: 10000, leaderboard: lb,
};

const render = () =>
  renderWithProviders(<Routes><Route path="/pools/:poolId/challenges/:cid" element={<ChallengeDetailPage />} /></Routes>, { route: '/pools/p1/challenges/c1' });

it('排行榜展示性别/年龄组/次数/里程占比 + 个人泳迹图按钮', async () => {
  server.use(http.get('/api/challenges/c1', () => HttpResponse.json(detail)));
  render();
  expect(await screen.findByText('Ada')).toBeInTheDocument();
  expect(screen.getByText('女')).toBeInTheDocument();
  expect(screen.getByText('男')).toBeInTheDocument();
  expect(screen.getByText('15至18岁')).toBeInTheDocument(); // Ada, born 2011 → 15 today
  expect(screen.getByText('9至14岁')).toBeInTheDocument(); // Ben, born 2012 → 14 today
  expect(screen.getByText('60%')).toBeInTheDocument(); // 6000 / 10000
  expect(screen.getByText('40%')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /个人泳迹图/ })).toHaveLength(2);
});

it('客户端搜索筛选排行榜', async () => {
  server.use(http.get('/api/challenges/c1', () => HttpResponse.json(detail)));
  render();
  await screen.findByText('Ada');
  await userEvent.type(screen.getByPlaceholderText('姓名/邮箱'), 'ben');
  await waitFor(() => expect(screen.queryByText('Ada')).not.toBeInTheDocument());
  expect(screen.getByText('Ben')).toBeInTheDocument();
});
