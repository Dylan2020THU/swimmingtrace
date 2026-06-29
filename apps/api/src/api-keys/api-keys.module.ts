import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BillingModule } from '../billing/billing.module';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';

@Module({
  imports: [BillingModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, PrismaService],
})
export class ApiKeysModule {}
