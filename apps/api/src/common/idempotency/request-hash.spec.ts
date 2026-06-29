import { requestHash } from './request-hash';

describe('requestHash', () => {
  it('同 method/path/body 产生稳定哈希', () => {
    expect(requestHash('POST', '/sessions', { distanceMeters: 100 })).toBe(
      requestHash('POST', '/sessions', { distanceMeters: 100 }),
    );
  });

  it('载荷不同则哈希不同', () => {
    expect(requestHash('POST', '/sessions', { distanceMeters: 100 })).not.toBe(
      requestHash('POST', '/sessions', { distanceMeters: 200 }),
    );
  });

  it('路径不同则哈希不同', () => {
    expect(requestHash('POST', '/sessions', { distanceMeters: 100 })).not.toBe(
      requestHash('POST', '/pools', { distanceMeters: 100 }),
    );
  });

  it('body 为空也稳定', () => {
    expect(requestHash('POST', '/x', undefined)).toBe(requestHash('POST', '/x', undefined));
  });
});
