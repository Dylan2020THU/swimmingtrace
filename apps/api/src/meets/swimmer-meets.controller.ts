import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { MeetsService, SelfEntryBody } from './meets.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth.common';

type U = { id: string };

/** Swimmer-facing self-registration: list open meets, enter an event, withdraw own entry. */
@ApiTags('meets')
@ApiBearerAuth()
@Controller('me/meets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SWIMMER)
export class SwimmerMeetsController {
  constructor(private meets: MeetsService) {}

  @Get()
  myMeets(@CurrentUser() u: U) {
    return this.meets.myOpenMeets(u.id);
  }

  @Post('events/:eid/entries')
  selfRegister(@CurrentUser() u: U, @Param('eid') eid: string, @Body() dto: SelfEntryBody) {
    return this.meets.selfRegister(u.id, eid, dto);
  }

  @Delete('entries/:enid')
  @HttpCode(200)
  withdraw(@CurrentUser() u: U, @Param('enid') enid: string) {
    return this.meets.withdrawOwn(u.id, enid);
  }
}
