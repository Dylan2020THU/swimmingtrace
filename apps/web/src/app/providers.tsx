import { ReactNode, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider } from 'antd';
import { useAuthStore } from '../lib/auth-store';
import { getMe } from '../lib/api/endpoints';
import { ErrorBoundary } from '../components/ErrorBoundary';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

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
      <ConfigProvider><AntdApp><ErrorBoundary>{children}</ErrorBoundary></AntdApp></ConfigProvider>
    </QueryClientProvider>
  );
}
