import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { Role } from '@prisma/client';
import { Plan } from '@swim/shared';
import { AccountService, DeleteAccountDto } from './account.service';
import { BillingService } from '../billing/billing.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth.common';

export class SetPlanBody {
  @IsIn(['FREE', 'PRO']) plan: Plan;
}

@ApiTags('account')
@ApiBearerAuth()
@Controller('account')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccountController {
  constructor(
    private account: AccountService,
    private billing: BillingService,
  ) {}

  /** Current subscription plan with limits, usage, and feature flags. */
  @Get('plan')
  @Roles(Role.OWNER)
  plan(@CurrentUser() user: { id: string }) {
    return this.billing.getPlanInfo(user.id);
  }

  /** Self-serve plan change (no payment; this is the future billing seam). */
  @Post('plan')
  @Roles(Role.OWNER)
  setPlan(@CurrentUser() user: { id: string }, @Body() dto: SetPlanBody) {
    return this.billing.setPlan(user.id, dto.plan);
  }

  /** Export the owner's full data graph (portability). */
  @Get('export')
  @Roles(Role.OWNER)
  export(@CurrentUser() user: { id: string }) {
    return this.account.exportData(user.id);
  }

  /** Permanently delete the owner account and all owned data (erasure), after password re-auth. */
  @Delete()
  @Roles(Role.OWNER)
  @HttpCode(200)
  remove(@CurrentUser() user: { id: string }, @Body() dto: DeleteAccountDto) {
    return this.account.deleteAccount(user.id, dto.password);
  }
}
