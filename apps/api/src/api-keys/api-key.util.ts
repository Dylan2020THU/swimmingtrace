import { createHash, randomBytes } from 'crypto';

export const API_KEY_PREFIX = 'swk_';
const PREFIX_DISPLAY_LEN = 12;

/** sha256 of the full key — only the hash is ever stored. */
export function hashApiKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A fresh key: `plaintext` is returned to the owner once; only `keyHash` is persisted. */
export function generateApiKey(): { plaintext: string; prefix: string; keyHash: string } {
  const plaintext = API_KEY_PREFIX + randomBytes(24).toString('base64url');
  return { plaintext, prefix: plaintext.slice(0, PREFIX_DISPLAY_LEN), keyHash: hashApiKey(plaintext) };
}
