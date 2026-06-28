const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: jest.fn().mockResolvedValue({}) });
jest.mock('nodemailer', () => ({ createTransport: (...a: unknown[]) => mockCreateTransport(...a) }));

import { MailService } from './mail.service';

const cfg = (m: Record<string, string | undefined>) => ({ get: (k: string) => m[k] }) as never;

describe('MailService', () => {
  beforeEach(() => mockCreateTransport.mockClear());

  it('SMTP_HOST 有值 → 用 SMTP 传输', () => {
    mockCreateTransport.mockReturnValueOnce({ sendMail: jest.fn() });
    new MailService(cfg({ SMTP_HOST: 'smtp.x.com', SMTP_PORT: '587' }));
    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.x.com', port: 587 }));
  });

  it('无 SMTP_HOST → jsonTransport（dev）', () => {
    mockCreateTransport.mockReturnValueOnce({ sendMail: jest.fn() });
    new MailService(cfg({}));
    expect(mockCreateTransport).toHaveBeenCalledWith({ jsonTransport: true });
  });

  it('sendPasswordReset 调底层 sendMail 且含 resetUrl', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    mockCreateTransport.mockReturnValueOnce({ sendMail });
    const svc = new MailService(cfg({}));
    await svc.sendPasswordReset('a@b.c', 'http://x/reset-password?token=T');
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toBe('a@b.c');
    expect(arg.text).toContain('http://x/reset-password?token=T');
  });

  it('sendClaimLink 调底层 sendMail 且含 claimUrl', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    mockCreateTransport.mockReturnValueOnce({ sendMail });
    const svc = new MailService(cfg({}));
    await svc.sendClaimLink('sw@x.com', 'http://swim/claim/TOK');
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toBe('sw@x.com');
    expect(arg.text).toContain('http://swim/claim/TOK');
  });
});
