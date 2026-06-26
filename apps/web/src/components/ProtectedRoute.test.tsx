import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../test/render';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuthStore } from '../lib/auth-store';

const Guarded = () => (
  <Routes>
    <Route path="/login" element={<div>登录页</div>} />
    <Route element={<ProtectedRoute />}>
      <Route path="/" element={<div>控制台首页</div>} />
    </Route>
  </Routes>
);

describe('ProtectedRoute', () => {
  beforeEach(() => useAuthStore.getState().clear());

  it('未登录 → 跳登录页', () => {
    renderWithProviders(<Guarded />, { route: '/' });
    expect(screen.getByText('登录页')).toBeInTheDocument();
  });

  it('登录但非 OWNER → 无权限', () => {
    useAuthStore.getState().setAuth('tok', { id: 's1', email: 's@x.com', role: 'SWIMMER' });
    renderWithProviders(<Guarded />, { route: '/' });
    expect(screen.getByText(/无权限|403/)).toBeInTheDocument();
  });

  it('OWNER → 进入控制台', () => {
    useAuthStore.getState().setAuth('tok', { id: 'o1', email: 'o@x.com', role: 'OWNER' });
    renderWithProviders(<Guarded />, { route: '/' });
    expect(screen.getByText('控制台首页')).toBeInTheDocument();
  });
});
