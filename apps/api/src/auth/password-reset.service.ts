import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma.service';
import { MailService } from '../mail/mail.service';
import { RefreshTokenService } from './refresh-token.service';
import { parseDurationMs } from '../common/duration';

@Injectable()
export class PasswordResetService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private config: ConfigService,
    private refreshTokens: RefreshTokenService,
  ) {}

  private hash(t: string): string {
    return createHash('sha256').update(t).digest('hex');
  }

  /** 无枚举：无论邮箱是否存在/已认领都正常返回；仅对已认领用户发信。 */
  async forgot(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.claimedAt) return;
    const token = randomBytes(32).toString('hex');
    const ttl = parseDurationMs(this.config.get<string>('PASSWORD_RESET_TTL') ?? '1h');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetTokenHash: this.hash(token), passwordResetExpiresAt: new Date(Date.now() + ttl) },
    });
    const base =
      user.role === 'OWNER'
        ? (this.config.get<string>('CORS_ORIGIN') ?? 'http://localhost:5173').split(',')[0].trim()
        : (this.config.get<string>('SWIMMER_APP_URL') ?? 'http://localhost:5174');
    await this.mail.sendPasswordReset(user.email, `${base}/reset-password?token=${token}`);
  }

  async reset(token: string, password: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { passwordResetTokenHash: this.hash(token) } });
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('重置链接无效或已过期');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null },
    });
    await this.refreshTokens.revokeAllForUser(user.id);
  }
}
