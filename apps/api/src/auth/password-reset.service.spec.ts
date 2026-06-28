import { BadRequestException } from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';

jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('NEWHASH') }));

const cfg = {
  get: (k: string) => ({ PASSWORD_RESET_TTL: '1h', CORS_ORIGIN: 'http://web', SWIMMER_APP_URL: 'http://swim' })[k],
} as never;

describe('PasswordResetService.forgot', () => {
  it('存在且已认领 → 写 hash + 发信（OWNER 用 web 域）', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'o@x.com', role: 'OWNER', claimedAt: new Date() }),
        update,
      },
    };
    const mail: any = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };
    await new PasswordResetService(prisma, mail, cfg, {} as never).forgot('o@x.com');
    expect(update.mock.calls[0][0].data.passwordResetTokenHash).toHaveLength(64);
    const url = mail.sendPasswordReset.mock.calls[0][1];
    expect(url).toMatch(/^http:\/\/web\/reset-password\?token=/);
  });

  it('不存在 → 不发信、正常返回', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
    const mail: any = { sendPasswordReset: jest.fn() };
    await new PasswordResetService(prisma, mail, cfg, {} as never).forgot('none@x.com');
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('未认领 → 不发信', async () => {
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 's@x.com', role: 'SWIMMER', claimedAt: null }) },
    };
    const mail: any = { sendPasswordReset: jest.fn() };
    await new PasswordResetService(prisma, mail, cfg, {} as never).forgot('s@x.com');
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });
});

describe('PasswordResetService.reset', () => {
  it('有效 → 改密 + 清列 + 撤全部会话', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma: any = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1', passwordResetExpiresAt: new Date(Date.now() + 1e6) }), update },
    };
    const refresh: any = { revokeAllForUser: jest.fn().mockResolvedValue(undefined) };
    await new PasswordResetService(prisma, {} as never, cfg, refresh).reset('tok', 'password123');
    expect(update.mock.calls[0][0].data).toMatchObject({
      passwordHash: 'NEWHASH',
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    });
    expect(refresh.revokeAllForUser).toHaveBeenCalledWith('u1');
  });

  it('过期 → BadRequest', async () => {
    const prisma: any = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1', passwordResetExpiresAt: new Date(Date.now() - 1000) }) },
    };
    await expect(
      new PasswordResetService(prisma, {} as never, cfg, {} as never).reset('tok', 'password123'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('无效（查无）→ BadRequest', async () => {
    const prisma: any = { user: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(
      new PasswordResetService(prisma, {} as never, cfg, {} as never).reset('x', 'password123'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
