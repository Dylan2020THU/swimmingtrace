import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { AccountExport } from '@swim/shared';
import { PrismaService } from '../prisma.service';

export class DeleteAccountDto {
  @IsString()
  @MinLength(1)
  password: string;
}

@Injectable()
export class AccountService {
  constructor(private prisma: PrismaService) {}

  /** GDPR-style portability: the owner's full data graph as serialisable JSON. */
  async exportData(ownerId: string): Promise<AccountExport> {
    const account = await this.prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
    const pools = await this.prisma.pool.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'asc' },
      include: {
        registrations: {
          include: { swimmer: { select: { id: true, email: true, name: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        sessions: { orderBy: { swamAt: 'asc' } },
        challenges: { orderBy: { startDate: 'asc' } },
      },
    });
    return {
      exportedAt: new Date().toISOString(),
      account: {
        id: account.id,
        email: account.email,
        name: account.name,
        role: account.role,
        createdAt: account.createdAt.toISOString(),
      },
      pools: pools.map((p) => ({
        id: p.id,
        name: p.name,
        address: p.address,
        latitude: p.latitude,
        longitude: p.longitude,
        createdAt: p.createdAt.toISOString(),
        archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
        swimmers: p.registrations.map((r) => ({
          swimmerId: r.swimmer.id,
          email: r.swimmer.email,
          name: r.swimmer.name,
          status: r.status,
          joinedAt: r.joinedAt.toISOString(),
        })),
        sessions: p.sessions.map((s) => ({
          id: s.id,
          swimmerId: s.swimmerId,
          poolId: s.poolId,
          distanceMeters: s.distanceMeters,
          durationSeconds: s.durationSeconds,
          swamAt: s.swamAt.toISOString(),
          createdAt: s.createdAt.toISOString(),
        })),
        challenges: p.challenges.map((c) => ({
          id: c.id,
          name: c.name,
          goalDistanceMeters: c.goalDistanceMeters,
          startDate: c.startDate.toISOString(),
          endDate: c.endDate.toISOString(),
        })),
      })),
    };
  }

  /**
   * GDPR-style erasure: re-authenticates with the password, then transactionally
   * deletes everything under the owner's pools and the owner account itself.
   * Swimmer accounts (independent identities) survive; only their data in these
   * pools is removed. RefreshToken / IdempotencyKey drop via FK cascade.
   */
  async deleteAccount(ownerId: string, password: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: ownerId } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('密码不正确');
    }
    const pools = await this.prisma.pool.findMany({ where: { ownerId }, select: { id: true } });
    const poolIds = pools.map((p) => p.id);
    await this.prisma.$transaction([
      this.prisma.swimSession.deleteMany({ where: { poolId: { in: poolIds } } }),
      this.prisma.challenge.deleteMany({ where: { poolId: { in: poolIds } } }),
      this.prisma.registration.deleteMany({ where: { poolId: { in: poolIds } } }),
      this.prisma.pool.deleteMany({ where: { ownerId } }),
      this.prisma.user.delete({ where: { id: ownerId } }),
    ]);
    return { ok: true };
  }
}
