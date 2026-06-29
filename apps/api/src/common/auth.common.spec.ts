import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './auth.common';
import { API_KEY_PREFIX, hashApiKey } from '../api-keys/api-key.util';

function ctxWith(authorization?: string) {
  const req: any = { headers: authorization ? { authorization } : {} };
  return { switchToHttp: () => ({ getRequest: () => req }) } as any;
}

describe('JwtAuthGuard (API key path)', () => {
  it('有效 swk_ key → 设 req.user 为 owner、返回 true、刷 lastUsedAt', async () => {
    const prisma: any = {
      apiKey: {
        findUnique: jest.fn().mockResolvedValue({ id: 'k1', owner: { id: 'o1', email: 'o@x.com', role: 'OWNER', emailVerifiedAt: null } }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const guard = new JwtAuthGuard(prisma);
    const ctx = ctxWith(`Bearer ${API_KEY_PREFIX}abc`);
    const ok = await guard.canActivate(ctx);
    expect(ok).toBe(true);
    expect(ctx.switchToHttp().getRequest().user).toMatchObject({ id: 'o1', role: 'OWNER' });
    expect(prisma.apiKey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { keyHash: hashApiKey(`${API_KEY_PREFIX}abc`) } }),
    );
    expect(prisma.apiKey.update).toHaveBeenCalled();
  });

  it('未知 swk_ key → 401', async () => {
    const prisma: any = { apiKey: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() } };
    const guard = new JwtAuthGuard(prisma);
    await expect(guard.canActivate(ctxWith(`Bearer ${API_KEY_PREFIX}nope`))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('非 swk_ Bearer → 委托 JWT（不查 apiKey）', async () => {
    const prisma: any = { apiKey: { findUnique: jest.fn(), update: jest.fn() } };
    const mixinProto = Object.getPrototypeOf(JwtAuthGuard.prototype);
    const spy = jest.spyOn(mixinProto, 'canActivate').mockResolvedValue(true as any);
    const guard = new JwtAuthGuard(prisma);
    const ok = await guard.canActivate(ctxWith('Bearer eyJ.jwt.token'));
    expect(ok).toBe(true);
    expect(prisma.apiKey.findUnique).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
