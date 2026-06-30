import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { OverviewStats, PoolStats, SwimmerStats, HeatmapCell, MemberProfile, MemberSessionRow, Paginated } from '@swim/shared';
import { assertOwnsPool, assertOwnsSwimmer } from '../common/ownership';
import { paginate } from '../common/pagination';

@Injectable()
export class StatsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /**
   * Per-day distance for one filter (swimmer or pool) within a calendar year.
   * Days are bucketed in APP_TIMEZONE (default 'UTC') so a swim near local
   * midnight lands on the right calendar cell; the date is formatted to
   * 'YYYY-MM-DD' in SQL to avoid any JS-side timezone round-trip. Aggregating
   * in SQL keeps the payload to ~365 rows max. Empty days are simply absent.
   */
  private async dailyDistance(where: Prisma.Sql, year: number): Promise<HeatmapCell[]> {
    const tz = this.config.get<string>('APP_TIMEZONE') ?? 'UTC';
    // Convert the stored UTC instant to the operator's local wall-clock, then
    // both bucket AND filter on that same local value so the calendar-year
    // window lines up with the day buckets (no off-by-one at year edges when
    // tz != UTC).
    const localTs = Prisma.sql`("swamAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})`;
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year + 1}-01-01`;
    const rows = await this.prisma.$queryRaw<{ day: string; total: bigint }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', ${localTs}), 'YYYY-MM-DD') AS day,
             SUM("distanceMeters") AS total
      FROM "SwimSession"
      WHERE ${where}
        AND ${localTs} >= ${yearStart}::timestamp
        AND ${localTs} <  ${yearEnd}::timestamp
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

  /**
   * Owner-facing member stats, scoped to the member's training IN THIS OWNER'S pools
   * (so one owner never sees a member's activity in another owner's pool). The heatmap
   * uses `year` (default current). Summary is all-time within the owner's pools.
   */
  async swimmerStats(ownerId: string, swimmerId: string, year?: number): Promise<SwimmerStats> {
    await assertOwnsSwimmer(this.prisma, ownerId, swimmerId);
    const agg = await this.prisma.swimSession.aggregate({
      where: { swimmerId, pool: { ownerId } }, _sum: { distanceMeters: true, durationSeconds: true }, _count: true,
    });
    const ownerScope = Prisma.sql`"swimmerId" = ${swimmerId} AND "poolId" IN (SELECT "id" FROM "Pool" WHERE "ownerId" = ${ownerId})`;
    const heatmap = await this.dailyDistance(ownerScope, year ?? new Date().getUTCFullYear());
    return {
      summary: {
        totalDistanceMeters: agg._sum.distanceMeters ?? 0,
        totalDurationSeconds: agg._sum.durationSeconds ?? 0,
        sessionCount: agg._count,
      },
      heatmap,
    };
  }

  /** Owner-facing member profile: basic info + the member's registrations in this owner's pools. */
  async memberProfile(ownerId: string, swimmerId: string): Promise<MemberProfile> {
    await assertOwnsSwimmer(this.prisma, ownerId, swimmerId);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: swimmerId },
      select: { id: true, name: true, email: true, gender: true, birthDate: true, claimedAt: true, createdAt: true },
    });
    const regs = await this.prisma.registration.findMany({
      where: { swimmerId, pool: { ownerId } },
      include: { pool: { select: { id: true, name: true } } },
      orderBy: { joinedAt: 'desc' },
    });
    return {
      swimmerId: user.id,
      name: user.name,
      email: user.email,
      gender: user.gender ?? null,
      birthDate: user.birthDate ? user.birthDate.toISOString() : null,
      claimedAt: user.claimedAt ? user.claimedAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      pools: regs.map((r) => ({ poolId: r.pool.id, poolName: r.pool.name, status: r.status, joinedAt: r.joinedAt.toISOString() })),
    };
  }

  /** Owner-facing member session history (reverse-chron, paginated), scoped to this owner's pools + year. */
  async memberSessions(ownerId: string, swimmerId: string, year?: number, page?: number, pageSize?: number): Promise<Paginated<MemberSessionRow>> {
    await assertOwnsSwimmer(this.prisma, ownerId, swimmerId);
    const y = year ?? new Date().getUTCFullYear();
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const where: Prisma.SwimSessionWhereInput = {
      swimmerId,
      pool: { ownerId },
      swamAt: { gte: new Date(Date.UTC(y, 0, 1)), lt: new Date(Date.UTC(y + 1, 0, 1)) },
    };
    const [items, total] = await Promise.all([
      this.prisma.swimSession.findMany({ where, include: { pool: { select: { name: true } } }, orderBy: { swamAt: 'desc' }, skip, take }),
      this.prisma.swimSession.count({ where }),
    ]);
    return {
      items: items.map((s) => ({
        id: s.id,
        swamAt: s.swamAt.toISOString(),
        distanceMeters: s.distanceMeters,
        durationSeconds: s.durationSeconds,
        poolId: s.poolId,
        poolName: s.pool?.name ?? null,
      })),
      total,
      page: p,
      pageSize: ps,
    };
  }
}
