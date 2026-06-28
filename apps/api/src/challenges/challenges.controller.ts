import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ChallengesService, CreateChallengeBody } from './challenges.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth.common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

type AuthedUser = { id: string; role: Role };

@ApiTags('challenges')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChallengesController {
  constructor(private challenges: ChallengesService) {}

  @Post('pools/:id/challenges')
  @Roles(Role.OWNER)
  create(@CurrentUser() u: AuthedUser, @Param('id') poolId: string, @Body() dto: CreateChallengeBody) {
    return this.challenges.create(u.id, poolId, dto);
  }

  @Get('pools/:id/challenges')
  @Roles(Role.OWNER)
  list(@CurrentUser() u: AuthedUser, @Param('id') poolId: string) {
    return this.challenges.listForPool(u.id, poolId);
  }

  @Get('challenges/active')
  @Roles(Role.OWNER)
  active(@CurrentUser() u: AuthedUser) {
    return this.challenges.activeForOwner(u.id);
  }

  @Get('challenges/:cid')
  @Roles(Role.OWNER)
  detail(@CurrentUser() u: AuthedUser, @Param('cid') cid: string) {
    return this.challenges.detail(u.id, cid);
  }

  @Delete('challenges/:cid')
  @Roles(Role.OWNER)
  remove(@CurrentUser() u: AuthedUser, @Param('cid') cid: string) {
    return this.challenges.remove(u.id, cid);
  }
}
