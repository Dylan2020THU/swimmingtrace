import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';
import { parseDurationMs } from '../common/duration';

@Injectable()
export class RefreshTokenService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private ttlMs(): number {
    return parseDurationMs(this.config.get<string>('REFRESH_TOKEN_TTL') ?? '30d');
  }

  /** 新明文 refresh（仅存 hash）。无 familyId 则开新家族。 */
  async issue(userId: string, familyId?: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(token),
        familyId: familyId ?? randomUUID(),
        expiresAt: new Date(Date.now() + this.ttlMs()),
      },
    });
    return token;
  }

  /** 校验 + 轮换。复用已撤销 token ⇒ 撤族并抛。 */
  async rotate(presented: string): Promise<{ token: string; userId: string }> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hash(presented) } });
    if (!row) throw new UnauthorizedException('refresh token 无效');
    if (row.revokedAt) {
      // 重放已轮换走的 token → 疑似失窃 → 撤销整个家族。
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException('refresh token 已失效');
    }
    if (row.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('refresh token 已过期');

    const next = await this.issue(row.userId, row.familyId);
    const nextRow = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hash(next) } });
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date(), replacedById: nextRow?.id ?? null },
    });
    return { token: next, userId: row.userId };
  }

  async revoke(presented: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(presented), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
