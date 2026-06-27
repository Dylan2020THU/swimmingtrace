import { it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './auth-store';

beforeEach(() => {
  useAuthStore.getState().clear();
  localStorage.clear();
});

it('setAuth 存 token+user 并写入 localStorage', () => {
  useAuthStore.getState().setAuth('tok', { id: 's1', email: 's@x.com', role: 'SWIMMER' });
  expect(useAuthStore.getState().token).toBe('tok');
  expect(useAuthStore.getState().user?.email).toBe('s@x.com');
  expect(localStorage.getItem('swim-swimmer-auth')).toContain('tok');
});

it('clear 清空 token+user', () => {
  useAuthStore.getState().setAuth('tok', { id: 's1', email: 's@x.com', role: 'SWIMMER' });
  useAuthStore.getState().clear();
  expect(useAuthStore.getState().token).toBeNull();
  expect(useAuthStore.getState().user).toBeNull();
});
