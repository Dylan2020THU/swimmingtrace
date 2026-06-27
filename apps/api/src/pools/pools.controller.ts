import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  CreatePoolDto,
  CreateSwimmerDto,
  PoolsService,
  RecordSessionDto,
  RegisterSwimmerDto,
  UpdateMembershipDto,
  UpdatePoolDto,
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
    return this.pools.listSwimmers(user.id, poolId);
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  update(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Body() dto: UpdatePoolDto) {
    return this.pools.updatePool(user.id, id, dto);
  }

  @Post(':id/archive')
  @Roles(Role.OWNER)
  archive(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.pools.archivePool(user.id, id);
  }

  @Post(':id/swimmers')
  @Roles(Role.OWNER)
  createSwimmer(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Body() dto: CreateSwimmerDto) {
    return this.pools.createSwimmer(user.id, id, dto);
  }

  @Patch(':id/swimmers/:sid')
  @Roles(Role.OWNER)
  setMembership(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Param('sid') sid: string, @Body() dto: UpdateMembershipDto) {
    return this.pools.setMembershipStatus(user.id, id, sid, dto);
  }

  @Post(':id/swimmers/:sid/sessions')
  @Roles(Role.OWNER)
  record(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Param('sid') sid: string, @Body() dto: RecordSessionDto) {
    return this.pools.recordSessionForSwimmer(user.id, id, sid, dto);
  }

  @Post(':id/swimmers/:sid/claim-link')
  @Roles(Role.OWNER)
  claimLink(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Param('sid') sid: string) {
    return this.pools.generateClaimLink(user.id, id, sid);
  }
}
