import { BadRequestException } from '@nestjs/common';
import { EmailVerificationService } from './email-verification.service';

const cfg = { get: (k: string) => ({ EMAIL_VERIFY_TTL: '24h', CORS_ORIGIN: 'http://web' })[k] } as never;

describe('EmailVerificationService', () => {
  it('sendVerification 写 hash + 发信（含 web verify 链接）', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma: any = { user: { update } };
    const mail: any = { sendMail: jest.fn().mockResolvedValue(undefined) };
    await new EmailVerificationService(prisma, mail, cfg).sendVerification('u1', 'o@x.com', 'OWNER' as never);
    expect(update.mock.calls[0][0].data.emailVerifyTokenHash).toHaveLength(64);
    const body = mail.sendMail.mock.calls[0][0];
    expect(body.to).toBe('o@x.com');
    expect(body.text).toMatch(/http:\/\/web\/verify-email\?token=/);
  });

  it('verify 有效 → 置 emailVerifiedAt + 清列', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma: any = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1', emailVerifyExpiresAt: new Date(Date.now() + 1e6) }), update },
    };
    await new EmailVerificationService(prisma, {} as never, cfg).verify('tok');
    const data = update.mock.calls[0][0].data;
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(data).toMatchObject({ emailVerifyTokenHash: null, emailVerifyExpiresAt: null });
  });

  it('verify 过期/无效 → BadRequest', async () => {
    const expired: any = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1', emailVerifyExpiresAt: new Date(Date.now() - 1000) }) },
    };
    await expect(new EmailVerificationService(expired, {} as never, cfg).verify('t')).rejects.toBeInstanceOf(BadRequestException);
    const none: any = { user: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(new EmailVerificationService(none, {} as never, cfg).verify('t')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resend 已验证 → 不发信；未验证 → 发信', async () => {
    const mail: any = { sendMail: jest.fn().mockResolvedValue(undefined) };
    const verified: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'o@x.com', role: 'OWNER', emailVerifiedAt: new Date() }) },
    };
    await new EmailVerificationService(verified, mail, cfg).resend('u1');
    expect(mail.sendMail).not.toHaveBeenCalled();

    const update = jest.fn().mockResolvedValue({});
    const unverified: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'o@x.com', role: 'OWNER', emailVerifiedAt: null }), update },
    };
    await new EmailVerificationService(unverified, mail, cfg).resend('u1');
    expect(mail.sendMail).toHaveBeenCalled();
  });
});
