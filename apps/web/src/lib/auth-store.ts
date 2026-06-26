import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MeResponse } from '@swim/shared';

interface AuthState {
  token: string | null;
  user: MeResponse | null;
  setAuth: (token: string, user: MeResponse) => void;
  setUser: (user: MeResponse) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      clear: () => set({ token: null, user: null }),
    }),
    {
      name: 'swim-auth',
      partialize: (s) => ({ token: s.token }), // 只持久化 token；user 启动时用 /auth/me 重新拉
    },
  ),
);
