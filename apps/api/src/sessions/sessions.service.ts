import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { PrismaService } from '../prisma.service';
import { paginate } from '../common/pagination';

export class CreateSessionDto {
  @IsInt() @Min(1) distanceMeters: number;
  @IsOptional() @IsInt() @Min(1) durationSeconds?: number;
  @IsDateString() swamAt: string; // ISO 8601
  @IsOptional() @IsUUID() poolId?: string;
}

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  async create(swimmerId: string, dto: CreateSessionDto) {
    // A swimmer may only attribute a self-recorded swim to a pool they are
    // actively registered in — so the data lands cleanly in that pool's stats.
    if (dto.poolId) {
      const reg = await this.prisma.registration.findUnique({
        where: { swimmerId_poolId: { swimmerId, poolId: dto.poolId } },
      });
      if (!reg || reg.status !== 'ACTIVE') {
        throw new ForbiddenException('你未在该泳池有效登记');
      }
    }
    return this.prisma.swimSession.create({
      data: {
        swimmerId,
        poolId: dto.poolId,
        distanceMeters: dto.distanceMeters,
        durationSeconds: dto.durationSeconds,
        swamAt: new Date(dto.swamAt),
      },
    });
  }

  async listForSwimmer(swimmerId: string, page?: number, pageSize?: number) {
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const where = { swimmerId };
    const [items, total] = await Promise.all([
      this.prisma.swimSession.findMany({ where, orderBy: { swamAt: 'desc' }, skip, take }),
      this.prisma.swimSession.count({ where }),
    ]);
    return { items, total, page: p, pageSize: ps };
  }
}
