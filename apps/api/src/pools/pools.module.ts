import { Module } from '@nestjs/common';
import { PoolsController } from './pools.controller';
import { PoolsService } from './pools.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [PoolsController],
  providers: [PoolsService, PrismaService],
})
export class PoolsModule {}
