import { it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { HistoryPage } from './HistoryPage';

it('展示首页并「加载更多」追加下一页', async () => {
  server.use(
    http.get('/api/sessions/me', ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
      const item = (n: number) => ({ id: `s${n}`, distanceMeters: n * 100, durationSeconds: null, swamAt: '2026-06-01T00:00:00.000Z', poolId: null, createdAt: '2026-06-01T00:00:00.000Z' });
      return HttpResponse.json(
        page === 1
          ? { items: [item(1)], total: 2, page: 1, pageSize: 1 }
          : { items: [item(2)], total: 2, page: 2, pageSize: 1 },
      );
    }),
  );
  renderWithProviders(<HistoryPage />, { route: '/history' });
  expect(await screen.findByText('100 米')).toBeInTheDocument();
  await userEvent.click(screen.getByText('加载更多'));
  await waitFor(() => expect(screen.getByText('200 米')).toBeInTheDocument());
});
