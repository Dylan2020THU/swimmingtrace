import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BillingModule } from '../billing/billing.module';
import { MeetsController } from './meets.controller';
import { PublicMeetsController } from './public-meets.controller';
import { SwimmerMeetsController } from './swimmer-meets.controller';
import { MeetsService } from './meets.service';

@Module({
  imports: [BillingModule],
  controllers: [MeetsController, PublicMeetsController, SwimmerMeetsController],
  providers: [MeetsService, PrismaService],
})
export class MeetsModule {}
