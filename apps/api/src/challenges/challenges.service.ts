import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsDateString, IsInt, IsString, Min } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { ChallengeDetail, ChallengeSummary, CreateChallengeDto, LeaderboardRow } from '@swim/shared';
import { assertOwnsChallenge, assertOwnsPool } from '../common/ownership';

export class CreateChallengeBody implements CreateChallengeDto {
  @IsString() name: string;
  @IsInt() @Min(1) goalDistanceMeters: number;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
}

@Injectable()
export class ChallengesService {
  constructor(private prisma: PrismaService) {}

  async create(ownerId: string, poolId: string, dto: CreateChallengeDto) {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end <= start) throw new BadRequestException('结束日期需晚于开始日期');
    return this.prisma.challenge.create({
      data: { poolId, name: dto.name, goalDistanceMeters: dto.goalDistanceMeters, startDate: start, endDate: end },
    });
  }

  /** Per-swimmer distance leaderboard for a pool window, descending. Shared by detail + myChallenges. */
  async leaderboardOf(poolId: string, start: Date, end: Date): Promise<LeaderboardRow[]> {
    const rows = await this.prisma.$queryRaw<
      { swimmerId: string; name: string | null; email: string; distanceMeters: bigint }[]
    >(Prisma.sql`
      SELECT s."swimmerId" AS "swimmerId", u."name" AS "name", u."email" AS "email",
             SUM(s."distanceMeters") AS "distanceMeters"
      FROM "SwimSession" s
      JOIN "User" u ON u."id" = s."swimmerId"
      WHERE s."poolId" = ${poolId} AND s."swamAt" >= ${start} AND s."swamAt" < ${end}
      GROUP BY s."swimmerId", u."name", u."email"
      ORDER BY SUM(s."distanceMeters") DESC`);
    return rows.map((r) => ({ swimmerId: r.swimmerId, name: r.name, email: r.email, distanceMeters: Number(r.distanceMeters) }));
  }

  private toSummary(c: { id: string; poolId: string; name: string; goalDistanceMeters: number; startDate: Date; endDate: Date }, total: number): ChallengeSummary {
    return {
      id: c.id, poolId: c.poolId, name: c.name, goalDistanceMeters: c.goalDistanceMeters,
      startDate: c.startDate.toISOString(), endDate: c.endDate.toISOString(), totalDistanceMeters: total,
    };
  }

  async listForPool(ownerId: string, poolId: string): Promise<ChallengeSummary[]> {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    const list = await this.prisma.challenge.findMany({ where: { poolId }, orderBy: { createdAt: 'desc' } });
    return Promise.all(
      list.map(async (c) => {
        const agg = await this.prisma.swimSession.aggregate({
          where: { poolId, swamAt: { gte: c.startDate, lt: c.endDate } },
          _sum: { distanceMeters: true },
        });
        return this.toSummary(c, agg._sum.distanceMeters ?? 0);
      }),
    );
  }

  async detail(ownerId: string, challengeId: string): Promise<ChallengeDetail> {
    const c = await assertOwnsChallenge(this.prisma, ownerId, challengeId);
    const leaderboard = await this.leaderboardOf(c.poolId, c.startDate, c.endDate);
    const total = leaderboard.reduce((acc, r) => acc + r.distanceMeters, 0);
    return { ...this.toSummary(c, total), leaderboard };
  }

  async remove(ownerId: string, challengeId: string) {
    await assertOwnsChallenge(this.prisma, ownerId, challengeId);
    return this.prisma.challenge.delete({ where: { id: challengeId } });
  }
}
