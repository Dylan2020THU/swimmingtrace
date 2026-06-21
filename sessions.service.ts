import { Injectable } from '@nestjs/common';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { PrismaService } from '../prisma.service';

export class CreateSessionDto {
  @IsInt() @Min(1) distanceMeters: number;
  @IsOptional() @IsInt() @Min(1) durationSeconds?: number;
  @IsDateString() swamAt: string; // ISO 8601
  @IsOptional() @IsUUID() poolId?: string;
}

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  create(swimmerId: string, dto: CreateSessionDto) {
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

  listForSwimmer(swimmerId: string, take = 100) {
    return this.prisma.swimSession.findMany({
      where: { swimmerId },
      orderBy: { swamAt: 'desc' },
      take,
    });
  }
}
