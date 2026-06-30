import { it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { RecordsPage } from './RecordsPage';

it('展示赛会纪录板（项目/保持人/成绩）', async () => {
  server.use(
    http.get('/api/records', () =>
      HttpResponse.json([
        { distanceMeters: 50, stroke: 'FREE', gender: 'MALE', ageGroup: '9至14岁', swimmerId: 'a', name: 'Ada', timeMs: 30000, meetName: '夏季赛', meetDate: '2026-02-01T00:00:00.000Z' },
      ])),
  );
  renderWithProviders(<Routes><Route path="/records" element={<RecordsPage />} /></Routes>, { route: '/records' });

  expect(await screen.findByText('Ada')).toBeInTheDocument();
  expect(screen.getByText('50m 自由泳')).toBeInTheDocument();
  expect(screen.getByText('30.00')).toBeInTheDocument();
  expect(screen.getByText('夏季赛')).toBeInTheDocument();
});
