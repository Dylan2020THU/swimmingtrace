import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { OverviewStats, PoolStats, SwimmerStats, HeatmapCell } from '@swim/shared';
import { assertOwnsPool, assertOwnsSwimmer } from '../common/ownership';

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Per-day distance for one filter (swimmer or pool) within a calendar year.
   * Days are bucketed in APP_TIMEZONE (default 'UTC') so a swim near local
   * midnight lands on the right calendar cell; the date is formatted to
   * 'YYYY-MM-DD' in SQL to avoid any JS-side timezone round-trip. Aggregating
   * in SQL keeps the payload to ~365 rows max. Empty days are simply absent.
   */
  private async dailyDistance(where: Prisma.Sql, year: number): Promise<HeatmapCell[]> {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const tz = process.env.APP_TIMEZONE ?? 'UTC';
    const rows = await this.prisma.$queryRaw<{ day: string; total: bigint }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', "swamAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS day,
             SUM("distanceMeters") AS total
      FROM "SwimSession"
      WHERE ${where}
        AND "swamAt" >= ${start}
        AND "swamAt" <  ${end}
      GROUP BY day
      ORDER BY day ASC
    `);
    return rows.map((r) => ({ date: r.day, distanceMeters: Number(r.total) }));
  }

  /** GitHub-contributions-style per-day distance for a swimmer (swimmer self-view, Phase 2). */
  async heatmap(swimmerId: string, year: number): Promise<HeatmapCell[]> {
    return this.dailyDistance(Prisma.sql`"swimmerId" = ${swimmerId}`, year);
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

  private dailyByPool(poolId: string, year: number): Promise<HeatmapCell[]> {
    return this.dailyDistance(Prisma.sql`"poolId" = ${poolId}`, year);
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

  private dailyBySwimmer(swimmerId: string, year: number): Promise<HeatmapCell[]> {
    return this.dailyDistance(Prisma.sql`"swimmerId" = ${swimmerId}`, year);
  }

  async swimmerStats(ownerId: string, swimmerId: string): Promise<SwimmerStats> {
    await assertOwnsSwimmer(this.prisma, ownerId, swimmerId);
    const agg = await this.prisma.swimSession.aggregate({
      where: { swimmerId }, _sum: { distanceMeters: true, durationSeconds: true }, _count: true,
    });
    const heatmap = await this.dailyBySwimmer(swimmerId, new Date().getUTCFullYear());
    return {
      summary: {
        totalDistanceMeters: agg._sum.distanceMeters ?? 0,
        totalDurationSeconds: agg._sum.durationSeconds ?? 0,
        sessionCount: agg._count,
      },
      heatmap,
    };
  }
}
