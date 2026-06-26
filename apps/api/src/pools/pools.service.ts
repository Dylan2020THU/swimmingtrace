import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IsLatitude, IsLongitude, IsOptional, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../prisma.service';

export class CreatePoolDto {
  @IsString() name: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
}

export class RegisterSwimmerDto {
  @IsUUID() swimmerId: string;
}

@Injectable()
export class PoolsService {
  constructor(private prisma: PrismaService) {}

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

  async listSwimmers(poolId: string, ownerId: string) {
    const pool = await this.prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool) throw new NotFoundException('Pool not found');
    if (pool.ownerId !== ownerId) throw new ForbiddenException();

    return this.prisma.registration.findMany({
      where: { poolId, status: 'ACTIVE' },
      include: { swimmer: { select: { id: true, name: true, email: true } } },
    });
  }
}
