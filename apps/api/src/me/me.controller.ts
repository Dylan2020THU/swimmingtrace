import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { MeService } from './me.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth.common';

@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MeController {
  constructor(private me: MeService) {}

  @Get('pools')
  @Roles(Role.SWIMMER)
  pools(@CurrentUser() user: { id: string }) {
    return this.me.myPools(user.id);
  }
}
