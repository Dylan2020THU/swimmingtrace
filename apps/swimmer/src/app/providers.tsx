import { ReactNode, useEffect, useRef } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toast } from 'antd-mobile';
import { useAuthStore } from '../lib/auth-store';
import { getMe } from '../lib/api/endpoints';
import { createQueryClient } from '../lib/query-client';
import { ErrorBoundary } from '../components/ErrorBoundary';

const queryClient = createQueryClient((m) => Toast.show({ content: m }));

export function Providers({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current || !token) return;
    booted.current = true;
    getMe().then(setUser).catch(() => clear());
  }, [token, setUser, clear]);

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>{children}</ErrorBoundary>
    </QueryClientProvider>
  );
}
