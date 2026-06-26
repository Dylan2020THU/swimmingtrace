import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IsEmail, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { PoolDetail, PoolSummary, SwimmerListItem } from '@swim/shared';
import { assertOwnsPool } from '../common/ownership';
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
}

@Injectable()
export class PoolsService {
  constructor(private prisma: PrismaService) {}

  async listMyPools(ownerId: string, includeArchived = false): Promise<PoolSummary[]> {
    const pools = await this.prisma.pool.findMany({
      where: { ownerId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: { createdAt: 'desc' },
    });
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return Promise.all(
      pools.map(async (p) => {
        const memberCount = await this.prisma.registration.count({ where: { poolId: p.id, status: 'ACTIVE' } });
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

  createPool(ownerId: string, dto: CreatePoolDto) {
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
    const memberCount = await this.prisma.registration.count({ where: { poolId, status: 'ACTIVE' } });
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

  async listSwimmers(poolId: string, ownerId: string) {
    const pool = await this.prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool) throw new NotFoundException('Pool not found');
    if (pool.ownerId !== ownerId) throw new ForbiddenException();

    return this.prisma.registration.findMany({
      where: { poolId, status: 'ACTIVE' },
      include: { swimmer: { select: { id: true, name: true, email: true } } },
    });
  }

  async createSwimmer(ownerId: string, poolId: string, dto: CreateSwimmerDto): Promise<SwimmerListItem> {
    await assertOwnsPool(this.prisma, ownerId, poolId);
    let user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 12);
      user = await this.prisma.user.create({
        data: { email: dto.email, name: dto.name, passwordHash, role: 'SWIMMER' },
      });
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
    };
  }
}
