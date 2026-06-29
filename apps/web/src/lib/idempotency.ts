/**
 * A fresh idempotency key per submit. The same value rides along any automatic
 * retry of the request (e.g. the axios single-flight token refresh), so a flaky
 * network can't record one swim twice.
 */
export function idempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
