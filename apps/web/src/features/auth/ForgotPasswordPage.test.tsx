import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/render';
import { ForgotPasswordPage } from './ForgotPasswordPage';

describe('ForgotPasswordPage', () => {
  it('提交后显示通用提示（不泄露是否存在）', async () => {
    renderWithProviders(<ForgotPasswordPage />, { route: '/forgot-password' });
    await userEvent.type(screen.getByRole('textbox'), 'o@x.com');
    await userEvent.click(screen.getByRole('button', { name: /发送/ }));
    await waitFor(() => expect(screen.getByText(/若该邮箱已注册/)).toBeInTheDocument());
  });
});
