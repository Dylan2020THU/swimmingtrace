import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../../test/render';
import { ResetPasswordPage } from './ResetPasswordPage';

describe('ResetPasswordPage', () => {
  it('提交新密码成功后跳登录', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<div>登录页</div>} />
      </Routes>,
      { route: '/reset-password?token=T' },
    );
    await userEvent.type(screen.getByPlaceholderText('新密码（≥8）'), 'newpass123');
    await userEvent.type(screen.getByPlaceholderText('再次输入'), 'newpass123');
    await userEvent.click(screen.getByRole('button', { name: /重置/ }));
    await waitFor(() => expect(screen.getByText('登录页')).toBeInTheDocument());
  });
});
