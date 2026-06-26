import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
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

  @Get()
  @Roles(Role.OWNER)
  list(@CurrentUser() user: AuthedUser, @Query('includeArchived') includeArchived?: string) {
    return this.pools.listMyPools(user.id, includeArchived === 'true');
  }

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

  @Get(':id')
  @Roles(Role.OWNER)
  detail(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.pools.getPool(user.id, id);
  }

  @Get(':id/swimmers')
  @Roles(Role.OWNER)
  swimmers(@Param('id') poolId: string, @CurrentUser() user: AuthedUser) {
    return this.pools.listSwimmers(poolId, user.id);
  }
}
