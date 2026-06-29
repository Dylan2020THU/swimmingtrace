import { it, expect, vi } from 'vitest';
import { createQueryClient, extractErrorMessage } from './query-client';

it('extractErrorMessage：优先 response.data.message，数组用「；」连接，否则兜底', () => {
  expect(extractErrorMessage({ response: { data: { message: 'boom' } } })).toBe('boom');
  expect(extractErrorMessage({ response: { data: { message: ['a', 'b'] } } })).toBe('a；b');
  expect(extractErrorMessage(new Error('x'))).toBe('加载失败，请稍后重试');
});

it('query 失败时调用 notifyError（提取后的消息）', async () => {
  const notify = vi.fn();
  const qc = createQueryClient(notify);
  await qc
    .fetchQuery({
      queryKey: ['k'],
      queryFn: () => Promise.reject({ response: { data: { message: 'boom' } } }),
      retry: false,
    })
    .catch(() => {});
  expect(notify).toHaveBeenCalledWith('boom');
});
