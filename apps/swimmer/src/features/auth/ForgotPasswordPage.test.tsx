import { it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/render';
import { ForgotPasswordPage } from './ForgotPasswordPage';

it('提交后显示通用提示', async () => {
  renderWithProviders(<ForgotPasswordPage />, { route: '/forgot-password' });
  await userEvent.type(screen.getByPlaceholderText('邮箱'), 'o@x.com');
  await userEvent.click(screen.getByText('发送重置链接'));
  await waitFor(() => expect(screen.getByText(/若该邮箱已注册/)).toBeInTheDocument());
});
