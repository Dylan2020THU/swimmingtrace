import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './auth-store';

describe('useAuthStore', () => {
  beforeEach(() => { useAuthStore.getState().clear(); localStorage.clear(); });

  it('setAuth 存 token+user 并写入 localStorage', () => {
    useAuthStore.getState().setAuth('tok', { id: 'o1', email: 'o@x.com', role: 'OWNER' });
    expect(useAuthStore.getState().token).toBe('tok');
    expect(useAuthStore.getState().user?.email).toBe('o@x.com');
    expect(localStorage.getItem('swim-auth')).toContain('tok');
  });

  it('clear 清空 token+user', () => {
    useAuthStore.getState().setAuth('tok', { id: 'o1', email: 'o@x.com', role: 'OWNER' });
    useAuthStore.getState().clear();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('setAuth 第三参存 refreshToken；setTokens 同时更新双 token', () => {
    useAuthStore.getState().setAuth('a1', { id: 'o1', email: 'o@x.com', role: 'OWNER' }, 'r1');
    expect(useAuthStore.getState().refreshToken).toBe('r1');
    useAuthStore.getState().setTokens('a2', 'r2');
    expect(useAuthStore.getState().token).toBe('a2');
    expect(useAuthStore.getState().refreshToken).toBe('r2');
    useAuthStore.getState().clear();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });
});
