import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma.service';
import { MailService } from '../mail/mail.service';
import { parseDurationMs } from '../common/duration';

@Injectable()
export class EmailVerificationService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  private hash(t: string): string {
    return createHash('sha256').update(t).digest('hex');
  }

  // _role 保留以备将来按角色路由；当前仅 OWNER 自助注册，固定 web 域。
  async sendVerification(userId: string, email: string, _role: Role): Promise<void> {
    const token = randomBytes(32).toString('hex');
    const ttl = parseDurationMs(this.config.get<string>('EMAIL_VERIFY_TTL') ?? '24h');
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifyTokenHash: this.hash(token), emailVerifyExpiresAt: new Date(Date.now() + ttl) },
    });
    const web = (this.config.get<string>('CORS_ORIGIN') ?? 'http://localhost:5173').split(',')[0].trim();
    const url = `${web}/verify-email?token=${token}`;
    await this.mail.sendMail({
      to: email,
      subject: '验证你的 SwimmingTrace 邮箱',
      html: `<p>点击验证你的邮箱（24 小时内有效）：</p><p><a href="${url}">${url}</a></p>`,
      text: `验证邮箱（24 小时内有效）：${url}`,
    });
  }

  async verify(token: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { emailVerifyTokenHash: this.hash(token) } });
    if (!user || !user.emailVerifyExpiresAt || user.emailVerifyExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('验证链接无效或已过期');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date(), emailVerifyTokenHash: null, emailVerifyExpiresAt: null },
    });
  }

  async resend(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.emailVerifiedAt) return;
    await this.sendVerification(user.id, user.email, user.role);
  }
}
