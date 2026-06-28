import { it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { ClaimLinkButton } from './ClaimLinkButton';

it('生成认领链接并展示 URL', async () => {
  server.use(
    http.post('/api/pools/p1/swimmers/s1/claim-link', () =>
      HttpResponse.json({ claimToken: 'tok', claimUrl: 'http://localhost:5174/claim/tok', expiresAt: '2026-07-04T00:00:00.000Z' }),
    ),
  );
  renderWithProviders(<ClaimLinkButton poolId="p1" sid="s1" claimed={false} />);
  await userEvent.click(screen.getByRole('button', { name: /生成认领链接/ }));
  await waitFor(() => expect(screen.getByDisplayValue('http://localhost:5174/claim/tok')).toBeInTheDocument());
  expect(screen.getByText(/已发送邮件至该游泳者邮箱/)).toBeInTheDocument();
});

it('已认领 → 禁用按钮显示已认领', () => {
  renderWithProviders(<ClaimLinkButton poolId="p1" sid="s1" claimed={true} />);
  const btn = screen.getByRole('button', { name: '已认领' });
  expect(btn).toBeDisabled();
});
