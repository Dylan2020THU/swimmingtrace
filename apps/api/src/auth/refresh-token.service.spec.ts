import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service';

const cfg = { get: () => '30d' } as any;

describe('RefreshTokenService', () => {
  it('issue 落库存 hash（非明文）并返回明文', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma: any = { refreshToken: { create } };
    const svc = new RefreshTokenService(prisma, cfg);
    const token = await svc.issue('u1');
    expect(typeof token).toBe('string');
    const data = create.mock.calls[0][0].data;
    expect(data.tokenHash).not.toBe(token);
    expect(data.tokenHash).toHaveLength(64); // sha256 hex
    expect(data.userId).toBe('u1');
    expect(data.familyId).toBeTruthy();
  });

  it('rotate：有效 → 撤旧签新（同族），返回新明文+userId', async () => {
    const row = { id: 'r1', userId: 'u1', familyId: 'fam', revokedAt: null, expiresAt: new Date(Date.now() + 1e6) };
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(row) // 查 presented
      .mockResolvedValueOnce({ id: 'r2' }); // 查新 token 行（取 id 作 replacedById）
    const create = jest.fn().mockResolvedValue({});
    const update = jest.fn().mockResolvedValue({});
    const prisma: any = { refreshToken: { findUnique, create, update } };
    const svc = new RefreshTokenService(prisma, cfg);
    const res = await svc.rotate('plain');
    expect(res.userId).toBe('u1');
    expect(typeof res.token).toBe('string');
    expect(create.mock.calls[0][0].data.familyId).toBe('fam'); // 同族
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1' }, data: expect.objectContaining({ replacedById: 'r2' }) }),
    );
  });

  it('rotate：presented 已撤销 ⇒ 撤族 + Unauthorized（复用检测）', async () => {
    const row = { id: 'r1', userId: 'u1', familyId: 'fam', revokedAt: new Date(), expiresAt: new Date(Date.now() + 1e6) };
    const findUnique = jest.fn().mockResolvedValue(row);
    const updateMany = jest.fn().mockResolvedValue({});
    const prisma: any = { refreshToken: { findUnique, updateMany } };
    const svc = new RefreshTokenService(prisma, cfg);
    await expect(svc.rotate('plain')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ familyId: 'fam' }) }));
  });

  it('rotate：查无 → Unauthorized', async () => {
    const prisma: any = { refreshToken: { findUnique: jest.fn().mockResolvedValue(null) } };
    await expect(new RefreshTokenService(prisma, cfg).rotate('x')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokeAllForUser 撤销该用户全部未撤销', async () => {
    const updateMany = jest.fn().mockResolvedValue({});
    const prisma: any = { refreshToken: { updateMany } };
    await new RefreshTokenService(prisma, cfg).revokeAllForUser('u1');
    expect(updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });
});
