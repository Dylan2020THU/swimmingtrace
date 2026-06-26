import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  CreatePoolDto,
  PoolsService,
  RegisterSwimmerDto,
} from './pools.service';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
} from '../common/auth.common';

type AuthedUser = { id: string; role: Role };

@Controller('pools')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PoolsController {
  constructor(private pools: PoolsService) {}

  @Post()
  @Roles(Role.OWNER)
  create(@CurrentUser() user: AuthedUser, @Body() dto: CreatePoolDto) {
    return this.pools.createPool(user.id, dto);
  }

  @Post(':id/register')
  @Roles(Role.OWNER, Role.SWIMMER)
  register(
    @Param('id') poolId: string,
    @CurrentUser() user: AuthedUser,
    @Body() dto: RegisterSwimmerDto,
  ) {
    return this.pools.registerSwimmer(poolId, user.id, dto);
  }

  @Get(':id/swimmers')
  @Roles(Role.OWNER)
  swimmers(@Param('id') poolId: string, @CurrentUser() user: AuthedUser) {
    return this.pools.listSwimmers(poolId, user.id);
  }
}
