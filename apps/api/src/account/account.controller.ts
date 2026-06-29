import { Body, Controller, Delete, Get, HttpCode, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AccountService, DeleteAccountDto } from './account.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth.common';

@ApiTags('account')
@ApiBearerAuth()
@Controller('account')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccountController {
  constructor(private account: AccountService) {}

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
