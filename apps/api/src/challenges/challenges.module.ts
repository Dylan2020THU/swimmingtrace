import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ChallengesController } from './challenges.controller';
import { ChallengesService } from './challenges.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [BillingModule],
  controllers: [ChallengesController],
  providers: [ChallengesService, PrismaService],
  exports: [ChallengesService],
})
export class ChallengesModule {}
