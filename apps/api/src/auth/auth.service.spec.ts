import { ConflictException, GoneException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('HASHED'),
  compare: jest.fn(),
}));
import * as bcrypt from 'bcrypt';

const mkJwt = () => ({ sign: jest.fn().mockReturnValue('signed.jwt.token') }) as any;

describe('AuthService.register', () => {
  it('邮箱已存在 → ConflictException', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }) } };
    const svc = new AuthService(prisma, mkJwt());
    await expect(svc.register({ email: 'a@b.c', password: 'password123' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('新用户 → bcrypt 哈希、创建并签发 token；role 默认 SWIMMER', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.c', role: 'SWIMMER' });
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(null), create } };
    const svc = new AuthService(prisma, mkJwt());
    const res = await svc.register({ email: 'a@b.c', password: 'password123' });
    expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'a@b.c', role: 'SWIMMER', passwordHash: 'HASHED' }) }),
    );
    expect(res).toEqual({ accessToken: 'signed.jwt.token' });
  });

  it('role=OWNER → 以 OWNER 创建', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'u1', email: 'o@b.c', role: 'OWNER' });
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(null), create } };
    const svc = new AuthService(prisma, mkJwt());
    await svc.register({ email: 'o@b.c', password: 'password123', role: 'OWNER' as any });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: 'OWNER' }) }));
  });

  it('role=ADMIN → 被强制降级为 SWIMMER（不可自助提权）', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'u1', email: 'x@b.c', role: 'SWIMMER' });
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(null), create } };
    const svc = new AuthService(prisma, mkJwt());
    await svc.register({ email: 'x@b.c', password: 'password123', role: 'ADMIN' as any });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: 'SWIMMER' }) }));
  });
});

describe('AuthService.login', () => {
  it('用户不存在 → UnauthorizedException', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
    const svc = new AuthService(prisma, mkJwt());
    await expect(svc.login({ email: 'a@b.c', password: 'x' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('密码错误 → UnauthorizedException', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.c', role: 'OWNER', passwordHash: 'H' }) } };
    const svc = new AuthService(prisma, mkJwt());
    await expect(svc.login({ email: 'a@b.c', password: 'wrong' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('密码正确 → 返回 accessToken（payload 含 sub/email/role）', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.c', role: 'OWNER', passwordHash: 'H' }) } };
    const jwt = mkJwt();
    const svc = new AuthService(prisma, jwt);
    const res = await svc.login({ email: 'a@b.c', password: 'right' });
    expect(jwt.sign).toHaveBeenCalledWith({ sub: 'u1', email: 'a@b.c', role: 'OWNER' });
    expect(res).toEqual({ accessToken: 'signed.jwt.token' });
  });
});

const future = new Date(Date.now() + 1_000_000);

describe('AuthService.getClaimInfo', () => {
  it('有效令牌 → 返回 name/email', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ name: 'Sam', email: 's@x.c', claimedAt: null, claimTokenExpiresAt: future }) } };
    await expect(new AuthService(prisma, mkJwt()).getClaimInfo('tok')).resolves.toEqual({ name: 'Sam', email: 's@x.c' });
  });
  it('令牌不存在 → NotFound', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
    await expect(new AuthService(prisma, mkJwt()).getClaimInfo('x')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('过期 → Gone', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ email: 's@x.c', claimedAt: null, claimTokenExpiresAt: new Date(Date.now() - 1000) }) } };
    await expect(new AuthService(prisma, mkJwt()).getClaimInfo('tok')).rejects.toBeInstanceOf(GoneException);
  });
  it('已认领 → Conflict', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ email: 's@x.c', claimedAt: new Date(), claimTokenExpiresAt: future }) } };
    await expect(new AuthService(prisma, mkJwt()).getClaimInfo('tok')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AuthService.claim', () => {
  it('有效 → 写 pw/claimedAt、清令牌、签发 token', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 's@x.c', role: 'SWIMMER', claimedAt: null, claimTokenExpiresAt: future }), update } };
    const jwt = mkJwt();
    const res = await new AuthService(prisma, jwt).claim({ token: 'tok', password: 'password123' });
    const data = update.mock.calls[0][0].data;
    expect(data).toMatchObject({ passwordHash: 'HASHED', claimToken: null, claimTokenExpiresAt: null });
    expect(data.claimedAt).toBeInstanceOf(Date);
    expect(jwt.sign).toHaveBeenCalledWith({ sub: 'u1', email: 's@x.c', role: 'SWIMMER' });
    expect(res).toEqual({ accessToken: 'signed.jwt.token' });
  });
});
