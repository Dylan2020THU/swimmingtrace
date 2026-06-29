import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { BillingModule } from '../billing/billing.module';

@Module({ imports: [BillingModule], controllers: [AccountController], providers: [AccountService, PrismaService] })
export class AccountModule {}
