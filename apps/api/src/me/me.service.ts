import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Gender, MyPoolItem, MyChallengeItem, UpdateProfileDto } from '@swim/shared';
import { ChallengesService } from '../challenges/challenges.service';

@Injectable()
export class MeService {
  constructor(
    private prisma: PrismaService,
    private challenges: ChallengesService,
  ) {}

  /** Update the swimmer's own demographics (needed to self-register for meets). */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<{ gender: Gender | null; birthDate: string | null }> {
    const data: { gender?: Gender; birthDate?: Date } = {};
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.birthDate !== undefined) data.birthDate = new Date(dto.birthDate);
    const u = await this.prisma.user.update({ where: { id: userId }, data });
    return { gender: u.gender ?? null, birthDate: u.birthDate ? u.birthDate.toISOString() : null };
  }

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
