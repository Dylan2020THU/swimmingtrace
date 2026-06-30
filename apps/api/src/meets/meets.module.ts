import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BillingModule } from '../billing/billing.module';
import { MeetsController } from './meets.controller';
import { MeetsService } from './meets.service';

@Module({
  imports: [BillingModule],
  controllers: [MeetsController],
  providers: [MeetsService, PrismaService],
})
export class MeetsModule {}
