import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaService } from '../prisma.service';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  // PrismaService listed locally, per this codebase's per-module provider convention.
  providers: [PrismaHealthIndicator, PrismaService],
})
export class HealthModule {}
