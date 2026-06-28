import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/render';
import { VerifyEmailPage } from './VerifyEmailPage';

describe('VerifyEmailPage', () => {
  it('带 token mount 自动验证成功', async () => {
    renderWithProviders(<VerifyEmailPage />, { route: '/verify-email?token=T' });
    await waitFor(() => expect(screen.getByText('邮箱已验证')).toBeInTheDocument());
  });
});
