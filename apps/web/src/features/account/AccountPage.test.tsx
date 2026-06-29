import { it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { AccountPage } from './AccountPage';

it('导出按钮触发 /account/export 请求', async () => {
  let hit = false;
  server.use(
    http.get('/api/account/export', () => {
      hit = true;
      return HttpResponse.json({ exportedAt: 'x', account: {}, pools: [] });
    }),
  );
  (URL as any).createObjectURL = vi.fn(() => 'blob:1');
  (URL as any).revokeObjectURL = vi.fn();

  renderWithProviders(<AccountPage />);
  await userEvent.click(screen.getByRole('button', { name: '导出 JSON' }));
  await waitFor(() => expect(hit).toBe(true));
});

it('删除弹窗输入密码确认 → 以密码体调用 DELETE /account', async () => {
  let body: unknown = null;
  server.use(
    http.delete('/api/account', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ ok: true });
    }),
  );

  renderWithProviders(<AccountPage />);
  await userEvent.click(screen.getByRole('button', { name: '删除账号' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByPlaceholderText('登录密码'), 'pw12345');
  await userEvent.click(within(dialog).getByRole('button', { name: '确认删除' }));
  await waitFor(() => expect(body).toEqual({ password: 'pw12345' }));
});
