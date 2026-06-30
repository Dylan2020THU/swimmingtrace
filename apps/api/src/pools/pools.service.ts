import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Gender } from '@swim/shared';
import { PrismaService } from '../prisma.service';
import { MailService } from '../mail/mail.service';
import { BillingService } from '../billing/billing.service';
import { ClaimLinkResponse, CreateSessionDto, Paginated, PoolDetail, PoolSummary, SwimmerListItem } from '@swim/shared';
import { assertOwnsPool } from '../common/ownership';
import { paginate } from '../common/pagination';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';

export class CreatePoolDto {
  @IsString() name: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
}

export class UpdatePoolDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
}

export class RegisterSwimmerDto {
  @IsUUID() swimmerId: string;
}

export class CreateSwimmerDto {
  @IsOptional() @IsString() name?: string;
  @IsEmail() email: string;
  @IsOptional() @IsIn(['MALE', 'FEMALE']) gender?: Gender;
  @IsOptional() @IsDateString() birthDate?: string;
}

export class UpdateMembershipDto {
  @IsOptional() @IsEnum({ ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' }) status?: 'ACTIVE' | 'INACTIVE';
  @IsOptional() @IsIn(['MALE', 'FEMALE']) gender?: Gender;
  @IsOptional() @IsDateString() birthDate?: string;
}

export class RecordSessionDto implements CreateSessionDto {
  @IsInt() @Min(1) distanceMeters: number;
  @IsOptional() @IsInt() @Min(1) durationSeconds?: number;
  @IsDateString() swamAt: string;
}

@Injectable()
export class PoolsService {
  private readonly logger = new Logger(PoolsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mail: MailService,
    private billing: BillingService,
  ) {}

  async listMyPools(ownerId: string, includeArchived = false): Promise<PoolSummary[]> {
    const pools = await this.prisma.pool.findMany({
      where: { ownerId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: { createdAt: 'desc' },
    });
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return Promise.all(
      pools.map(async (p) => {
        const memberCount = await this.prisma.registration.count({ where: { poolId: p.id } });
        const agg = await this.prisma.swimSession.aggregate({
          where: { poolId: p.id, swamAt: { gte: since } },
          _sum: { distanceMeters: true },
        });
        return {
          id: p.id, name: p.name, address: p.address,
          latitude: p.latitude, longitude: p.longitude,
          memberCount, mileageLast30dMeters: agg._sum.distanceMeters ?? 0,
          archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
          createdAt: p.createdAt.toISOString(),
        };
      }),
    );
  }

  async createPool(ownerId: string, dto: CreatePoolDto) {
    await this.billing.assertCanCreatePool(ownerId);
    return this.prisma.pool.create({ data: { ...dto, ownerId } });
  }

  async registerSwimmer(poolId: string, requesterId: string, dto: RegisterSwimmerDto) {
    const pool = await this.prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool) throw new NotFoundException('Pool not found');

    // An owner may add anyone to their pool; a swimmer may only add themselves.
    const isOwner = pool.ownerId === requesterId;
    if (!isOwner && dto.swimmerId !== requesterId) {
      throw new ForbiddenException('Cannot register another swimmer');
    }

    return this.prisma.registration.upsert({
      where: { swimmerId_poolId: { swimmerId: dto.swimmerId, poolId } },
      create: { swimmerId: dto.swimmerId, poolId },
      update: { status: 'ACTIVE' },
    });
  }

  async getPool(ownerId: string, poolId: string): Promise<PoolDetail> {
    const pool = await assertOwnsPool(this.prisma, ownerId, poolId);
    const memberCount = await this.prisma.registration.count({ where: { poolId } });
    return {
      id: pool.id, name: pool.name, address: pool.address,
      latitude: pool.latitude, longitude: pool.longitude,
      archivedAt: pool.archivedAt ? pool.archivedAt.toISOString() : null,
      memberCount, createdAt: pool.createdAt.toISOString(),
    };
  }

  async updatePool(ownerId: string, poolId: string, dto: UpdatePoolDto) {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    return this.prisma.pool.update({ where: { id: poolId }, data: { ...dto } });
  }

  async archivePool(ownerId: string, poolId: string) {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    return this.prisma.pool.update({ where: { id: poolId }, data: { archivedAt: new Date() } });
  }

  async listSwimmers(
    ownerId: string,
    poolId: string,
    page?: number,
    pageSize?: number,
  ): Promise<Paginated<SwimmerListItem>> {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const [regs, total] = await Promise.all([
      this.prisma.registration.findMany({
        where: { poolId },
        include: { swimmer: { select: { id: true, name: true, email: true, claimedAt: true, gender: true, birthDate: true } } },
        orderBy: { joinedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.registration.count({ where: { poolId } }),
    ]);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const items = await Promise.all(
      regs.map(async (r) => {
        const agg = await this.prisma.swimSession.aggregate({
          where: { swimmerId: r.swimmerId, poolId, swamAt: { gte: since } },
          _sum: { distanceMeters: true },
        });
        return {
          swimmerId: r.swimmer.id, name: r.swimmer.name, email: r.swimmer.email,
          status: r.status, claimedAt: r.swimmer.claimedAt ? r.swimmer.claimedAt.toISOString() : null,
          mileageLast30dMeters: agg._sum.distanceMeters ?? 0, joinedAt: r.joinedAt.toISOString(),
          gender: r.swimmer.gender ?? null,
          birthDate: r.swimmer.birthDate ? r.swimmer.birthDate.toISOString() : null,
        };
      }),
    );
    return { items, total, page: p, pageSize: ps };
  }

  async createSwimmer(ownerId: string, poolId: string, dto: CreateSwimmerDto): Promise<SwimmerListItem> {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    await this.billing.assertCanAddMember(ownerId);
    const birthDate = dto.birthDate !== undefined ? (dto.birthDate ? new Date(dto.birthDate) : null) : undefined;
    let user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 12);
      user = await this.prisma.user.create({
        data: { email: dto.email, name: dto.name, passwordHash, role: 'SWIMMER', gender: dto.gender, birthDate: birthDate ?? undefined },
      });
    } else if (user.role !== 'SWIMMER') {
      // Never adopt an existing non-swimmer account (e.g. another OWNER) into a
      // roster by email — that would let it be claimed and taken over.
      throw new ConflictException('该邮箱已被其他账号占用，无法作为游泳者添加');
    } else {
      const data: { name?: string; gender?: Gender; birthDate?: Date | null } = {};
      if (dto.name && !user.name) data.name = dto.name;
      if (dto.gender !== undefined) data.gender = dto.gender;
      if (birthDate !== undefined) data.birthDate = birthDate;
      if (Object.keys(data).length) user = await this.prisma.user.update({ where: { id: user.id }, data });
    }
    const reg = await this.prisma.registration.upsert({
      where: { swimmerId_poolId: { swimmerId: user.id, poolId } },
      create: { swimmerId: user.id, poolId, status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
    });
    return {
      swimmerId: user.id, name: user.name, email: user.email,
      status: reg.status, claimedAt: user.claimedAt ? user.claimedAt.toISOString() : null,
      mileageLast30dMeters: 0, joinedAt: reg.joinedAt.toISOString(),
      gender: user.gender ?? null,
      birthDate: user.birthDate ? user.birthDate.toISOString() : null,
    };
  }

  /** Toggle membership status and/or update the swimmer's competition demographics. */
  async setMembershipStatus(ownerId: string, poolId: string, swimmerId: string, dto: UpdateMembershipDto) {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    const reg = await this.prisma.registration.findUnique({ where: { swimmerId_poolId: { swimmerId, poolId } } });
    if (!reg) throw new NotFoundException('该游泳者未登记在本泳池');
    if (dto.status) {
      await this.prisma.registration.update({ where: { swimmerId_poolId: { swimmerId, poolId } }, data: { status: dto.status } });
    }
    const data: { gender?: Gender; birthDate?: Date | null } = {};
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.birthDate !== undefined) data.birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
    if (Object.keys(data).length) await this.prisma.user.update({ where: { id: swimmerId }, data });
    return { ok: true };
  }

  async recordSessionForSwimmer(ownerId: string, poolId: string, swimmerId: string, dto: CreateSessionDto) {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    // 代录要求该游泳者确实登记在本池（而非 owner 名下任意池）。
    const reg = await this.prisma.registration.findUnique({
      where: { swimmerId_poolId: { swimmerId, poolId } },
    });
    if (!reg) throw new NotFoundException('该游泳者未登记在本泳池');
    return this.prisma.swimSession.create({
      data: {
        swimmerId,
        poolId,
        distanceMeters: dto.distanceMeters,
        durationSeconds: dto.durationSeconds,
        swamAt: new Date(dto.swamAt),
      },
    });
  }

  /** Owner generates a one-time claim link for a swimmer registered in their pool. */
  async generateClaimLink(ownerId: string, poolId: string, swimmerId: string): Promise<ClaimLinkResponse> {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    const reg = await this.prisma.registration.findUnique({
      where: { swimmerId_poolId: { swimmerId, poolId } },
    });
    if (!reg) throw new NotFoundException('该游泳者未登记在本泳池');
    // Only an owner-provisioned, never-claimed SWIMMER can be issued a claim link
    // — never an owner/admin or an already-claimed account.
    const target = await this.prisma.user.findUnique({ where: { id: swimmerId } });
    if (!target || target.role !== 'SWIMMER' || target.claimedAt) {
      throw new ConflictException('该账号无法生成认领链接');
    }
    const claimToken = randomBytes(32).toString('hex');
    const claimTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.user.update({ where: { id: swimmerId }, data: { claimToken, claimTokenExpiresAt } });
    const base = this.config.get<string>('SWIMMER_APP_URL') ?? 'http://localhost:5174';
    const claimUrl = `${base}/claim/${claimToken}`;
    await this.mail
      .sendClaimLink(target.email, claimUrl)
      .catch((e) => this.logger.warn(`认领链接邮件发送失败：${(e as Error).message}`));
    return { claimToken, claimUrl, expiresAt: claimTokenExpiresAt.toISOString() };
  }
}
