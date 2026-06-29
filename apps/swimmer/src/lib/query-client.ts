import { QueryCache, QueryClient } from '@tanstack/react-query';

/** Best-effort human message from an axios-style error; falls back to a generic line. */
export function extractErrorMessage(err: unknown): string {
  const m = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(m)) return m.join('；');
  if (typeof m === 'string' && m) return m;
  return '加载失败，请稍后重试';
}

/**
 * QueryClient whose query failures surface a toast instead of failing silently.
 * `notifyError` is injected so the wiring is unit-testable without the DOM.
 */
export function createQueryClient(notifyError: (msg: string) => void): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
    queryCache: new QueryCache({ onError: (err) => notifyError(extractErrorMessage(err)) }),
  });
}
