import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MeResponse } from '@swim/shared';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: MeResponse | null;
  setAuth: (token: string, user: MeResponse, refreshToken?: string) => void;
  setTokens: (token: string, refreshToken: string) => void;
  setUser: (user: MeResponse) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      // refreshToken 省略时保留既有值（login 流程会两次 setAuth）。
      setAuth: (token, user, refreshToken) =>
        set((s) => ({ token, user, refreshToken: refreshToken ?? s.refreshToken })),
      setTokens: (token, refreshToken) => set({ token, refreshToken }),
      setUser: (user) => set({ user }),
      clear: () => set({ token: null, refreshToken: null, user: null }),
    }),
    {
      name: 'swim-swimmer-auth',
      partialize: (s) => ({ token: s.token, refreshToken: s.refreshToken }), // 持久化双 token；user 启动时用 /auth/me 重新拉
    },
  ),
);
