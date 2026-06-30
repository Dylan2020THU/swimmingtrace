import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CreateSeasonBody, SeasonsService, SetSeasonPublishedBody } from './seasons.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth.common';

type U = { id: string };

@ApiTags('seasons')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER)
export class SeasonsController {
  constructor(private seasons: SeasonsService) {}

  @Post('seasons')
  create(@CurrentUser() u: U, @Body() dto: CreateSeasonBody) {
    return this.seasons.createSeason(u.id, dto);
  }

  @Get('seasons')
  list(@CurrentUser() u: U) {
    return this.seasons.listSeasons(u.id);
  }

  @Get('seasons/:id')
  detail(@CurrentUser() u: U, @Param('id') id: string) {
    return this.seasons.seasonDetail(u.id, id);
  }

  @Delete('seasons/:id')
  @HttpCode(200)
  remove(@CurrentUser() u: U, @Param('id') id: string) {
    return this.seasons.deleteSeason(u.id, id);
  }

  @Post('seasons/:id/publish')
  @HttpCode(200)
  publish(@CurrentUser() u: U, @Param('id') id: string, @Body() dto: SetSeasonPublishedBody) {
    return this.seasons.setSeasonPublished(u.id, id, dto.published);
  }

  @Get('records')
  records(@CurrentUser() u: U) {
    return this.seasons.clubRecordsOf(u.id);
  }
}
