import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MyPoolItem, MyChallengeItem } from '@swim/shared';
import { ChallengesService } from '../challenges/challenges.service';

@Injectable()
export class MeService {
  constructor(
    private prisma: PrismaService,
    private challenges: ChallengesService,
  ) {}

  /** Pools the swimmer is actively registered in (for selecting where to self-record). */
  async myPools(swimmerId: string): Promise<MyPoolItem[]> {
    const regs = await this.prisma.registration.findMany({
      where: { swimmerId, status: 'ACTIVE' },
      include: { pool: { select: { id: true, name: true } } },
      orderBy: { joinedAt: 'desc' },
    });
    return regs.map((r) => ({ id: r.pool.id, name: r.pool.name }));
  }

  /** Currently-running challenges in the swimmer's active pools, with the swimmer's own distance + rank. */
  async myChallenges(swimmerId: string): Promise<MyChallengeItem[]> {
    const regs = await this.prisma.registration.findMany({
      where: { swimmerId, status: 'ACTIVE' },
      select: { poolId: true },
    });
    const poolIds = regs.map((r) => r.poolId);
    if (poolIds.length === 0) return [];
    const now = new Date();
    const challenges = await this.prisma.challenge.findMany({
      where: { poolId: { in: poolIds }, startDate: { lte: now }, endDate: { gt: now } },
      include: { pool: { select: { name: true } } },
      orderBy: { endDate: 'asc' },
    });
    return Promise.all(
      challenges.map(async (c) => {
        const lb = await this.challenges.leaderboardOf(c.poolId, c.startDate, c.endDate);
        const total = lb.reduce((acc, r) => acc + r.distanceMeters, 0);
        const idx = lb.findIndex((r) => r.swimmerId === swimmerId);
        return {
          id: c.id,
          poolId: c.poolId,
          poolName: c.pool.name,
          name: c.name,
          goalDistanceMeters: c.goalDistanceMeters,
          totalDistanceMeters: total,
          myDistanceMeters: idx >= 0 ? lb[idx].distanceMeters : 0,
          myRank: idx >= 0 ? idx + 1 : null,
          startDate: c.startDate.toISOString(),
          endDate: c.endDate.toISOString(),
        };
      }),
    );
  }
}
