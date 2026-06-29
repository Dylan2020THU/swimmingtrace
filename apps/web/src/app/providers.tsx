import { ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider } from 'antd';
import { useAuthStore } from '../lib/auth-store';
import { getMe } from '../lib/api/endpoints';
import { createQueryClient } from '../lib/query-client';
import { ErrorBoundary } from '../components/ErrorBoundary';

function Inner({ children }: { children: ReactNode }) {
  const { message } = AntdApp.useApp();
  const [queryClient] = useState(() => createQueryClient((m) => message.error(m)));
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

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider>
      <AntdApp>
        <Inner>{children}</Inner>
      </AntdApp>
    </ConfigProvider>
  );
}
