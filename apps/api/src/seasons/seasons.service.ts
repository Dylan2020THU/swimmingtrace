import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IsBoolean, IsDateString, IsString } from 'class-validator';
import {
  CreateSeasonDto,
  PublicSeason,
  RecordRow,
  SeasonDetail,
  SeasonStandingsGroup,
  SeasonSummary,
  SetSeasonPublishedDto,
} from '@swim/shared';
import { PrismaService } from '../prisma.service';
import { BillingService } from '../billing/billing.service';
import { StandingEntry } from '../meets/standings';
import { SeasonEvent, seasonPoints } from '../meets/points';
import { RecordEntry, clubRecords } from '../meets/records';

export class CreateSeasonBody implements CreateSeasonDto {
  @IsString() name: string;
  @IsDateString() referenceDate: string;
}
export class SetSeasonPublishedBody implements SetSeasonPublishedDto {
  @IsBoolean() published: boolean;
}

// Prisma include shape shared by season-standings and records queries.
const ENTRY_INCLUDE = {
  swimmer: { select: { id: true, name: true, gender: true, birthDate: true } },
} as const;

@Injectable()
export class SeasonsService {
  constructor(
    private prisma: PrismaService,
    private billing: BillingService,
  ) {}

  private async ownSeason(ownerId: string, id: string) {
    const season = await this.prisma.season.findUnique({ where: { id } });
    if (!season) throw new NotFoundException('赛季不存在');
    if (season.ownerId !== ownerId) throw new ForbiddenException();
    return season;
  }

  private toSummary(s: { id: string; name: string; referenceDate: Date; published: boolean; createdAt: Date; _count: { meets: number } }): SeasonSummary {
    return {
      id: s.id,
      name: s.name,
      referenceDate: s.referenceDate.toISOString(),
      published: s.published,
      meetCount: s._count.meets,
      createdAt: s.createdAt.toISOString(),
    };
  }

  async createSeason(ownerId: string, dto: CreateSeasonDto): Promise<SeasonSummary> {
    await this.billing.assertFeature(ownerId, 'meets');
    const s = await this.prisma.season.create({
      data: { ownerId, name: dto.name, referenceDate: new Date(dto.referenceDate) },
      include: { _count: { select: { meets: true } } },
    });
    return this.toSummary(s);
  }

  async listSeasons(ownerId: string): Promise<SeasonSummary[]> {
    const seasons = await this.prisma.season.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { meets: true } } },
    });
    return seasons.map((s) => this.toSummary(s));
  }

  /** Compute a season's points leaderboard from all its meets' events at the season reference date. */
  private async standingsForSeason(season: { id: string; referenceDate: Date }): Promise<SeasonStandingsGroup[]> {
    const meets = await this.prisma.meet.findMany({
      where: { seasonId: season.id },
      include: { events: { include: { entries: { include: ENTRY_INCLUDE } } } },
    });
    const events: SeasonEvent[] = meets.flatMap((m) =>
      m.events.map((ev) => ({
        entries: ev.entries.map(
          (e): StandingEntry => ({
            swimmerId: e.swimmer.id,
            name: e.swimmer.name,
            gender: e.swimmer.gender ?? null,
            birthDate: e.swimmer.birthDate ?? null,
            resultTimeMs: e.resultTimeMs,
            resultStatus: e.resultStatus,
          }),
        ),
      })),
    );
    return seasonPoints(events, season.referenceDate);
  }

  async seasonDetail(ownerId: string, id: string): Promise<SeasonDetail> {
    const season = await this.ownSeason(ownerId, id);
    const meets = await this.prisma.meet.findMany({
      where: { seasonId: id },
      orderBy: { meetDate: 'asc' },
      select: { id: true, name: true, meetDate: true },
    });
    const standings = await this.standingsForSeason(season);
    return {
      id: season.id,
      name: season.name,
      referenceDate: season.referenceDate.toISOString(),
      published: season.published,
      meetCount: meets.length,
      createdAt: season.createdAt.toISOString(),
      meets: meets.map((m) => ({ id: m.id, name: m.name, meetDate: m.meetDate.toISOString() })),
      standings,
    };
  }

  async deleteSeason(ownerId: string, id: string): Promise<{ ok: true }> {
    await this.ownSeason(ownerId, id);
    await this.prisma.season.delete({ where: { id } });
    return { ok: true };
  }

  async setSeasonPublished(ownerId: string, id: string, published: boolean): Promise<{ published: boolean }> {
    await this.ownSeason(ownerId, id);
    await this.prisma.season.update({ where: { id }, data: { published } });
    return { published };
  }

  /** Public season points board — only for a published season; PII-free (name+age-group+points). */
  async publicSeason(id: string): Promise<PublicSeason> {
    const season = await this.prisma.season.findUnique({ where: { id } });
    if (!season || !season.published) throw new NotFoundException();
    const standings = await this.standingsForSeason(season);
    return { id: season.id, name: season.name, standings };
  }

  /** Public club records for a published season's owner; PII-free (no ownerId/email). */
  async publicSeasonRecords(id: string): Promise<RecordRow[]> {
    const season = await this.prisma.season.findUnique({ where: { id } });
    if (!season || !season.published) throw new NotFoundException();
    return this.clubRecordsOf(season.ownerId);
  }

  /** Club records over all of an owner's meets. */
  async clubRecordsOf(ownerId: string): Promise<RecordRow[]> {
    const entries = await this.prisma.meetEntry.findMany({
      where: { raceEvent: { meet: { ownerId } } },
      include: { swimmer: { select: { id: true, name: true, gender: true, birthDate: true } }, raceEvent: { include: { meet: { select: { ownerId: true, name: true, meetDate: true } } } } },
    });
    return clubRecords(entries.map((e): RecordEntry => ({
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
    })));
  }
}
