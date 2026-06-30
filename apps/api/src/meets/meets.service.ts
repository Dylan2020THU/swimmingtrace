import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import {
  CreateEntryDto,
  CreateMeetDto,
  CreateRaceEventDto,
  EntryItem,
  Gender,
  MeetDetail,
  MeetSummary,
  RaceEventItem,
  ResultStatus,
  SetResultDto,
  StandingsGroup,
  Stroke,
} from '@swim/shared';
import { PrismaService } from '../prisma.service';
import { BillingService } from '../billing/billing.service';
import { StandingEntry, computeStandings } from './standings';

export class CreateMeetBody implements CreateMeetDto {
  @IsString() name: string;
  @IsDateString() meetDate: string;
  @IsOptional() @IsUUID() hostPoolId?: string | null;
}
export class CreateRaceEventBody implements CreateRaceEventDto {
  @IsInt() @Min(25) distanceMeters: number;
  @IsIn(['FREE', 'BACK', 'BREAST', 'FLY', 'IM']) stroke: Stroke;
}
export class CreateEntryBody implements CreateEntryDto {
  @IsUUID() swimmerId: string;
  @IsOptional() @IsInt() @Min(0) seedTimeMs?: number | null;
}
export class SetResultBody implements SetResultDto {
  @IsIn(['ENTERED', 'OK', 'DNS', 'DNF', 'DQ']) resultStatus: ResultStatus;
  @IsOptional() @IsInt() @Min(0) resultTimeMs?: number | null;
}

type SwimmerLite = { id: string; name: string | null; email: string; gender: Gender | null; birthDate: Date | null };
type EntryRow = { id: string; swimmerId: string; seedTimeMs: number | null; resultTimeMs: number | null; resultStatus: ResultStatus };

@Injectable()
export class MeetsService {
  constructor(
    private prisma: PrismaService,
    private billing: BillingService,
  ) {}

  // ---- ownership guards ----
  private async ownMeet(ownerId: string, meetId: string) {
    const meet = await this.prisma.meet.findUnique({ where: { id: meetId } });
    if (!meet) throw new NotFoundException('赛事不存在');
    if (meet.ownerId !== ownerId) throw new ForbiddenException();
    return meet;
  }
  private async ownEvent(ownerId: string, eventId: string) {
    const ev = await this.prisma.raceEvent.findUnique({ where: { id: eventId }, include: { meet: true } });
    if (!ev) throw new NotFoundException('项目不存在');
    if (ev.meet.ownerId !== ownerId) throw new ForbiddenException();
    return ev;
  }
  private async ownEntry(ownerId: string, entryId: string) {
    const en = await this.prisma.meetEntry.findUnique({
      where: { id: entryId },
      include: { raceEvent: { include: { meet: true } } },
    });
    if (!en) throw new NotFoundException('报名不存在');
    if (en.raceEvent.meet.ownerId !== ownerId) throw new ForbiddenException();
    return en;
  }

  private toEntryItem(e: EntryRow, s: SwimmerLite): EntryItem {
    return {
      id: e.id,
      swimmerId: s.id,
      name: s.name,
      email: s.email,
      gender: s.gender ?? null,
      birthDate: s.birthDate ? s.birthDate.toISOString() : null,
      seedTimeMs: e.seedTimeMs,
      resultTimeMs: e.resultTimeMs,
      resultStatus: e.resultStatus,
    };
  }

  // ---- meets ----
  async createMeet(ownerId: string, dto: CreateMeetDto): Promise<MeetSummary> {
    await this.billing.assertFeature(ownerId, 'meets');
    if (dto.hostPoolId) {
      const pool = await this.prisma.pool.findUnique({ where: { id: dto.hostPoolId } });
      if (!pool || pool.ownerId !== ownerId) throw new NotFoundException('主办泳池不存在');
    }
    const meet = await this.prisma.meet.create({
      data: { ownerId, name: dto.name, meetDate: new Date(dto.meetDate), hostPoolId: dto.hostPoolId ?? null },
      include: { hostPool: { select: { name: true } } },
    });
    return {
      id: meet.id,
      name: meet.name,
      meetDate: meet.meetDate.toISOString(),
      hostPoolId: meet.hostPoolId,
      hostPoolName: meet.hostPool?.name ?? null,
      eventCount: 0,
      createdAt: meet.createdAt.toISOString(),
    };
  }

  async listMeets(ownerId: string): Promise<MeetSummary[]> {
    const meets = await this.prisma.meet.findMany({
      where: { ownerId },
      orderBy: { meetDate: 'desc' },
      include: { hostPool: { select: { name: true } }, _count: { select: { events: true } } },
    });
    return meets.map((m) => ({
      id: m.id,
      name: m.name,
      meetDate: m.meetDate.toISOString(),
      hostPoolId: m.hostPoolId,
      hostPoolName: m.hostPool?.name ?? null,
      eventCount: m._count.events,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async meetDetail(ownerId: string, meetId: string): Promise<MeetDetail> {
    await this.ownMeet(ownerId, meetId);
    const m = await this.prisma.meet.findUniqueOrThrow({
      where: { id: meetId },
      include: {
        hostPool: { select: { name: true } },
        events: { orderBy: { order: 'asc' }, include: { _count: { select: { entries: true } } } },
      },
    });
    return {
      id: m.id,
      name: m.name,
      meetDate: m.meetDate.toISOString(),
      hostPoolId: m.hostPoolId,
      hostPoolName: m.hostPool?.name ?? null,
      eventCount: m.events.length,
      createdAt: m.createdAt.toISOString(),
      events: m.events.map((e) => ({ id: e.id, distanceMeters: e.distanceMeters, stroke: e.stroke, order: e.order, entryCount: e._count.entries })),
    };
  }

  async deleteMeet(ownerId: string, meetId: string): Promise<{ ok: true }> {
    await this.ownMeet(ownerId, meetId);
    await this.prisma.meet.delete({ where: { id: meetId } });
    return { ok: true };
  }

  // ---- race events ----
  async addEvent(ownerId: string, meetId: string, dto: CreateRaceEventDto): Promise<RaceEventItem> {
    await this.ownMeet(ownerId, meetId);
    const order = await this.prisma.raceEvent.count({ where: { meetId } });
    const ev = await this.prisma.raceEvent.create({ data: { meetId, distanceMeters: dto.distanceMeters, stroke: dto.stroke, order } });
    return { id: ev.id, distanceMeters: ev.distanceMeters, stroke: ev.stroke, order: ev.order, entryCount: 0 };
  }

  async deleteEvent(ownerId: string, eventId: string): Promise<{ ok: true }> {
    await this.ownEvent(ownerId, eventId);
    await this.prisma.raceEvent.delete({ where: { id: eventId } });
    return { ok: true };
  }

  // ---- entries ----
  async addEntry(ownerId: string, eventId: string, dto: CreateEntryDto): Promise<EntryItem> {
    await this.ownEvent(ownerId, eventId);
    const swimmer = await this.prisma.user.findUnique({ where: { id: dto.swimmerId } });
    if (!swimmer) throw new NotFoundException('会员不存在');
    const member = await this.prisma.registration.findFirst({ where: { swimmerId: dto.swimmerId, pool: { ownerId } } });
    if (!member) throw new NotFoundException('该会员不在你名下');
    if (!swimmer.gender || !swimmer.birthDate) {
      throw new UnprocessableEntityException('请先在名册补全该会员的性别与出生日期');
    }
    try {
      const entry = await this.prisma.meetEntry.create({
        data: { raceEventId: eventId, swimmerId: dto.swimmerId, seedTimeMs: dto.seedTimeMs ?? null },
      });
      return this.toEntryItem(entry, swimmer);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('该会员已报名此项目');
      }
      throw e;
    }
  }

  async listEntries(ownerId: string, eventId: string): Promise<EntryItem[]> {
    await this.ownEvent(ownerId, eventId);
    const entries = await this.prisma.meetEntry.findMany({
      where: { raceEventId: eventId },
      include: { swimmer: { select: { id: true, name: true, email: true, gender: true, birthDate: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return entries.map((e) => this.toEntryItem(e, e.swimmer));
  }

  async deleteEntry(ownerId: string, entryId: string): Promise<{ ok: true }> {
    await this.ownEntry(ownerId, entryId);
    await this.prisma.meetEntry.delete({ where: { id: entryId } });
    return { ok: true };
  }

  async setResult(ownerId: string, entryId: string, dto: SetResultDto): Promise<EntryItem> {
    await this.ownEntry(ownerId, entryId);
    const updated = await this.prisma.meetEntry.update({
      where: { id: entryId },
      data: { resultStatus: dto.resultStatus, resultTimeMs: dto.resultTimeMs ?? null },
      include: { swimmer: { select: { id: true, name: true, email: true, gender: true, birthDate: true } } },
    });
    return this.toEntryItem(updated, updated.swimmer);
  }

  // ---- standings ----
  async standingsOf(ownerId: string, eventId: string): Promise<StandingsGroup[]> {
    const ev = await this.ownEvent(ownerId, eventId);
    const entries = await this.prisma.meetEntry.findMany({
      where: { raceEventId: eventId },
      include: { swimmer: { select: { id: true, name: true, gender: true, birthDate: true } } },
    });
    const standingEntries: StandingEntry[] = entries.map((e) => ({
      swimmerId: e.swimmer.id,
      name: e.swimmer.name,
      gender: e.swimmer.gender ?? null,
      birthDate: e.swimmer.birthDate ?? null,
      resultTimeMs: e.resultTimeMs,
      resultStatus: e.resultStatus,
    }));
    return computeStandings(standingEntries, ev.meet.meetDate);
  }
}
