import { NotFoundException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { API_KEY_PREFIX } from './api-key.util';

const mkBilling = (over: Record<string, unknown> = {}) =>
  ({ assertFeature: jest.fn().mockResolvedValue(undefined), ...over }) as any;

describe('ApiKeysService', () => {
  it('create：Pro 门禁；返回明文，库里只存 hash', async () => {
    const prisma: any = {
      apiKey: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'k1', label: data.label, prefix: data.prefix, keyHash: data.keyHash, createdAt: new Date('2026-06-30T00:00:00.000Z') }),
        ),
      },
    };
    const billing = mkBilling();
    const out = await new ApiKeysService(prisma, billing).create('o1', 'CI');
    expect(billing.assertFeature).toHaveBeenCalledWith('o1', 'apiKeys');
    expect(out.key.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(out.label).toBe('CI');
    const created = prisma.apiKey.create.mock.calls[0][0].data;
    expect(created.keyHash).toBeTruthy();
    expect(created).not.toHaveProperty('key'); // 明文不入库
    expect(out.key).not.toBe(created.keyHash); // 明文 != hash
  });

  it('create：FREE 无 apiKeys → assertFeature 抛，不建 key', async () => {
    const prisma: any = { apiKey: { create: jest.fn() } };
    const billing = mkBilling({ assertFeature: jest.fn().mockRejectedValue(new Error('402')) });
    await expect(new ApiKeysService(prisma, billing).create('o1', 'x')).rejects.toThrow('402');
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it('list：映射且不含 hash/明文', async () => {
    const prisma: any = {
      apiKey: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'k1', label: 'CI', prefix: 'swk_abcdef12', keyHash: 'SECRETHASH', lastUsedAt: null, createdAt: new Date('2026-06-30T00:00:00.000Z') },
        ]),
      },
    };
    const out = await new ApiKeysService(prisma, mkBilling()).list('o1');
    expect(out[0]).toEqual({ id: 'k1', label: 'CI', prefix: 'swk_abcdef12', lastUsedAt: null, createdAt: '2026-06-30T00:00:00.000Z' });
    expect(JSON.stringify(out)).not.toContain('SECRETHASH');
  });

  it('revoke：按 (id, ownerId) 删；未命中 → 404', async () => {
    const prisma: any = { apiKey: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    await expect(new ApiKeysService(prisma, mkBilling()).revoke('o1', 'k1')).resolves.toEqual({ ok: true });
    expect(prisma.apiKey.deleteMany).toHaveBeenCalledWith({ where: { id: 'k1', ownerId: 'o1' } });

    const prisma2: any = { apiKey: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    await expect(new ApiKeysService(prisma2, mkBilling()).revoke('o1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
  });
});
