vi.mock('@uiw/react-heat-map', () => ({ default: () => null }));

import { it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { SwimmerDetailPage } from './SwimmerDetailPage';

const stats0 = { summary: { totalDistanceMeters: 3000, totalDurationSeconds: 1800, sessionCount: 4 }, heatmap: [] };

function mount() {
  return renderWithProviders(
    <Routes><Route path="/pools/:poolId/swimmers/:sid" element={<SwimmerDetailPage />} /></Routes>,
    { route: '/pools/p1/swimmers/s1' },
  );
}

it('展示汇总并代录一次', async () => {
  let recorded = false;
  server.use(
    http.get('/api/stats/swimmer/s1', () => HttpResponse.json(recorded
      ? { ...stats0, summary: { ...stats0.summary, sessionCount: 5 } } : stats0)),
    http.post('/api/pools/p1/swimmers/s1/sessions', async () => { recorded = true; return HttpResponse.json({ id: 'ss1' }); }),
  );
  mount();
  expect(await screen.findByText('3000')).toBeInTheDocument(); // 总里程
  await userEvent.click(screen.getByRole('button', { name: /代录/ }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('距离(米)'), '1000');
  // swamAt: 用 DatePicker 默认（测试只需必填距离即可提交；若 DatePicker 必填，见实现说明）
  await userEvent.click(within(dialog).getByRole('button', { name: /确定|提交/ }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
