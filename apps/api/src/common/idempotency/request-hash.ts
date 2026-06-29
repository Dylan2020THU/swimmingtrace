import { createHash } from 'crypto';

/**
 * Deterministic fingerprint of a request's identity (method + path + body).
 * Used to detect reuse of the same Idempotency-Key with a different payload.
 */
export function requestHash(method: string, path: string, body: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify({ method, path, body: body ?? null }))
    .digest('hex');
}
