import { Module } from '@nestjs/common';
import { PoolsController } from './pools.controller';
import { PoolsService } from './pools.service';
import { PrismaService } from '../prisma.service';
import { MailModule } from '../mail/mail.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [MailModule, BillingModule],
  controllers: [PoolsController],
  providers: [PoolsService, PrismaService],
})
export class PoolsModule {}
