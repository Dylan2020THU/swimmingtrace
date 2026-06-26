import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface HeatmapCell {
  date: string; // YYYY-MM-DD
  distanceMeters: number;
}

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
}
