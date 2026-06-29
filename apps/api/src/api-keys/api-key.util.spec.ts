import { API_KEY_PREFIX, generateApiKey, hashApiKey } from './api-key.util';

describe('api-key util', () => {
  it('generateApiKey：明文带 swk_ 前缀、prefix 为明文前缀、hash 确定且非明文', () => {
    const k = generateApiKey();
    expect(k.plaintext.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(k.plaintext.startsWith(k.prefix)).toBe(true);
    expect(k.prefix.length).toBe(12);
    expect(k.keyHash).toBe(hashApiKey(k.plaintext));
    expect(k.keyHash).not.toBe(k.plaintext);
  });

  it('两次生成的明文不同', () => {
    expect(generateApiKey().plaintext).not.toBe(generateApiKey().plaintext);
  });

  it('hashApiKey 确定性', () => {
    expect(hashApiKey('swk_abc')).toBe(hashApiKey('swk_abc'));
    expect(hashApiKey('swk_abc')).not.toBe(hashApiKey('swk_abd'));
  });
});
