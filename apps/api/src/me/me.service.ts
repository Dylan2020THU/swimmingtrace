import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Gender, MyPoolItem, MyChallengeItem, PbRow, UpdateProfileDto } from '@swim/shared';
import { ChallengesService } from '../challenges/challenges.service';
import { RecordEntry, clubRecords, personalBests } from '../meets/records';

// Prisma row → records pure-function input.
type EntryRow = {
  swimmer: { id: string; name: string | null; gender: Gender | null; birthDate: Date | null };
  resultTimeMs: number | null;
  resultStatus: RecordEntry['resultStatus'];
  raceEvent: { distanceMeters: number; stroke: RecordEntry['stroke']; meet: { ownerId: string; name: string; meetDate: Date } };
};
const toRecordEntry = (e: EntryRow): RecordEntry => ({
  ownerId: e.raceEvent.meet.ownerId,
  swimmerId: e.swimmer.id,
  name: e.swimmer.name,
  gender: e.swimmer.gender ?? null,
  birthDate: e.swimmer.birthDate ?? null,
  distanceMeters: e.raceEvent.distanceMeters,
  stroke: e.raceEvent.stroke,
  resultTimeMs: e.resultTimeMs,
  resultStatus: e.resultStatus,
  meetName: e.raceEvent.meet.name,
  meetDate: e.raceEvent.meet.meetDate,
});
const ENTRY_INCLUDE = {
  swimmer: { select: { id: true, name: true, gender: true, birthDate: true } },
  raceEvent: { include: { meet: { select: { ownerId: true, name: true, meetDate: true } } } },
} as const;

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

  /** The swimmer's personal bests per event, flagged when a PB currently holds a club record. */
  async myRecords(swimmerId: string): Promise<PbRow[]> {
    const mine = await this.prisma.meetEntry.findMany({ where: { swimmerId }, include: ENTRY_INCLUDE });
    if (mine.length === 0) return [];
    const ownerIds = [...new Set(mine.map((e) => e.raceEvent.meet.ownerId))];
    const all = await this.prisma.meetEntry.findMany({
      where: { raceEvent: { meet: { ownerId: { in: ownerIds } } } },
      include: ENTRY_INCLUDE,
    });
    const records = clubRecords(all.map(toRecordEntry));
    return personalBests(mine.map(toRecordEntry), records);
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
