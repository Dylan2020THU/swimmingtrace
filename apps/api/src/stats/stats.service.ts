import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { OverviewStats, PoolStats, HeatmapCell } from '@swim/shared';
import { assertOwnsPool } from '../common/ownership';

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  /**
   * GitHub-contributions-style data: one row per day the swimmer swam,
   * with the total distance that day. The client maps distance -> color
   * intensity. Empty days are simply absent (render them as the lightest box).
   *
   * Aggregating in SQL keeps the payload to ~365 rows max.
   */
  async heatmap(swimmerId: string, year: number): Promise<HeatmapCell[]> {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));

    const rows = await this.prisma.$queryRaw<
      { day: Date; total: bigint }[]
    >`
      SELECT date_trunc('day', "swamAt") AS day,
             SUM("distanceMeters")      AS total
      FROM "SwimSession"
      WHERE "swimmerId" = ${swimmerId}
        AND "swamAt" >= ${start}
        AND "swamAt" <  ${end}
      GROUP BY day
      ORDER BY day ASC
    `;

    return rows.map((r) => ({
      date: r.day.toISOString().slice(0, 10),
      distanceMeters: Number(r.total),
    }));
  }

  async overview(ownerId: string): Promise<OverviewStats> {
    const pools = await this.prisma.pool.findMany({ where: { ownerId, archivedAt: null }, select: { id: true } });
    const poolIds = pools.map((p) => p.id);
    if (poolIds.length === 0) {
      return { poolCount: 0, memberCount: 0, activeMemberCount: 0, mileageThisMonthMeters: 0, sessionsThisMonth: 0 };
    }
    const memberCount = await this.prisma.registration.count({ where: { poolId: { in: poolIds } } });
    const activeMemberCount = await this.prisma.registration.count({ where: { poolId: { in: poolIds }, status: 'ACTIVE' } });
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const agg = await this.prisma.swimSession.aggregate({
      where: { poolId: { in: poolIds }, swamAt: { gte: monthStart } },
      _sum: { distanceMeters: true }, _count: true,
    });
    return {
      poolCount: poolIds.length, memberCount, activeMemberCount,
      mileageThisMonthMeters: agg._sum.distanceMeters ?? 0, sessionsThisMonth: agg._count,
    };
  }

  /** Totals for the swimmer's profile header. */
  async summary(swimmerId: string) {
    const agg = await this.prisma.swimSession.aggregate({
      where: { swimmerId },
      _sum: { distanceMeters: true, durationSeconds: true },
      _count: true,
    });

    return {
      totalDistanceMeters: agg._sum.distanceMeters ?? 0,
      totalDurationSeconds: agg._sum.durationSeconds ?? 0,
      sessionCount: agg._count,
      // TODO (Phase 2): current streak, best day, weekly trend.
    };
  }

  private async dailyByPool(poolId: string, year: number): Promise<HeatmapCell[]> {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const rows = await this.prisma.$queryRaw<{ day: Date; total: bigint }[]>`
      SELECT date_trunc('day', "swamAt") AS day, SUM("distanceMeters") AS total
      FROM "SwimSession"
      WHERE "poolId" = ${poolId} AND "swamAt" >= ${start} AND "swamAt" < ${end}
      GROUP BY day ORDER BY day ASC
    `;
    return rows.map((r) => ({ date: r.day.toISOString().slice(0, 10), distanceMeters: Number(r.total) }));
  }

  async poolStats(ownerId: string, poolId: string): Promise<PoolStats> {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    const memberCount = await this.prisma.registration.count({ where: { poolId } });
    const activeMemberCount = await this.prisma.registration.count({ where: { poolId, status: 'ACTIVE' } });
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const agg = await this.prisma.swimSession.aggregate({
      where: { poolId, swamAt: { gte: monthStart } }, _sum: { distanceMeters: true },
    });
    const daily = await this.dailyByPool(poolId, now.getUTCFullYear());
    return {
      memberCount, activeMemberCount,
      mileageThisMonthMeters: agg._sum.distanceMeters ?? 0,
      trend: daily, heatmap: daily,
    };
  }
}
