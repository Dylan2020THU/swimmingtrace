import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { MeService } from './me.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth.common';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MeController {
  constructor(private me: MeService) {}

  @Get('pools')
  @Roles(Role.SWIMMER)
  pools(@CurrentUser() user: { id: string }) {
    return this.me.myPools(user.id);
  }

  @Get('challenges')
  @Roles(Role.SWIMMER)
  challenges(@CurrentUser() user: { id: string }) {
    return this.me.myChallenges(user.id);
  }
}
