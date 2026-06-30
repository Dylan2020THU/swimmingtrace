import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BillingModule } from '../billing/billing.module';
import { SeasonsController } from './seasons.controller';
import { SeasonsService } from './seasons.service';

@Module({
  imports: [BillingModule],
  controllers: [SeasonsController],
  providers: [SeasonsService, PrismaService],
})
export class SeasonsModule {}
