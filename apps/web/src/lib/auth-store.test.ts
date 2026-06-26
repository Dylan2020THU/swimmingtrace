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
});
