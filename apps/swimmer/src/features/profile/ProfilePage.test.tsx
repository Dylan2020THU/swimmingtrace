import { it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../../test/render';
import { ProfilePage } from './ProfilePage';
import { useAuthStore } from '../../lib/auth-store';

beforeEach(() => useAuthStore.getState().setAuth('tok', { id: 's1', email: 's@x.com', role: 'SWIMMER' }));

it('显示邮箱，点「附近泳池」跳转 /nearby', async () => {
  renderWithProviders(
    <Routes>
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/nearby" element={<div>附近页</div>} />
    </Routes>,
    { route: '/profile' },
  );
  expect(screen.getByText('s@x.com')).toBeInTheDocument();
  await userEvent.click(screen.getByText('附近泳池'));
  await waitFor(() => expect(screen.getByText('附近页')).toBeInTheDocument());
});
