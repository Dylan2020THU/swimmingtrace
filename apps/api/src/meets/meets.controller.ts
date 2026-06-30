import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AssignSeasonBody, CreateEntryBody, CreateMeetBody, CreateRaceEventBody, MeetsService, SetPublishedBody, SetRegistrationBody, SetResultBody } from './meets.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth.common';

type U = { id: string };

@ApiTags('meets')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER)
export class MeetsController {
  constructor(private meets: MeetsService) {}

  @Post('meets')
  createMeet(@CurrentUser() u: U, @Body() dto: CreateMeetBody) {
    return this.meets.createMeet(u.id, dto);
  }

  @Get('meets')
  list(@CurrentUser() u: U) {
    return this.meets.listMeets(u.id);
  }

  @Get('meets/:id')
  detail(@CurrentUser() u: U, @Param('id') id: string) {
    return this.meets.meetDetail(u.id, id);
  }

  @Delete('meets/:id')
  @HttpCode(200)
  removeMeet(@CurrentUser() u: U, @Param('id') id: string) {
    return this.meets.deleteMeet(u.id, id);
  }

  @Post('meets/:id/publish')
  @HttpCode(200)
  publish(@CurrentUser() u: U, @Param('id') id: string, @Body() dto: SetPublishedBody) {
    return this.meets.setPublished(u.id, id, dto.published);
  }

  @Post('meets/:id/registration')
  @HttpCode(200)
  setRegistration(@CurrentUser() u: U, @Param('id') id: string, @Body() dto: SetRegistrationBody) {
    return this.meets.setRegistrationOpen(u.id, id, dto.registrationOpen);
  }

  @Post('meets/:id/season')
  @HttpCode(200)
  setSeason(@CurrentUser() u: U, @Param('id') id: string, @Body() dto: AssignSeasonBody) {
    return this.meets.setMeetSeason(u.id, id, dto.seasonId);
  }

  @Post('meets/:id/events')
  addEvent(@CurrentUser() u: U, @Param('id') id: string, @Body() dto: CreateRaceEventBody) {
    return this.meets.addEvent(u.id, id, dto);
  }

  @Delete('events/:eid')
  @HttpCode(200)
  removeEvent(@CurrentUser() u: U, @Param('eid') eid: string) {
    return this.meets.deleteEvent(u.id, eid);
  }

  @Post('events/:eid/entries')
  addEntry(@CurrentUser() u: U, @Param('eid') eid: string, @Body() dto: CreateEntryBody) {
    return this.meets.addEntry(u.id, eid, dto);
  }

  @Get('events/:eid/entries')
  entries(@CurrentUser() u: U, @Param('eid') eid: string) {
    return this.meets.listEntries(u.id, eid);
  }

  @Get('events/:eid/standings')
  standings(@CurrentUser() u: U, @Param('eid') eid: string) {
    return this.meets.standingsOf(u.id, eid);
  }

  @Post('events/:eid/seed')
  @HttpCode(200)
  seed(@CurrentUser() u: U, @Param('eid') eid: string) {
    return this.meets.seedEvent(u.id, eid);
  }

  @Delete('entries/:enid')
  @HttpCode(200)
  removeEntry(@CurrentUser() u: U, @Param('enid') enid: string) {
    return this.meets.deleteEntry(u.id, enid);
  }

  @Patch('entries/:enid/result')
  setResult(@CurrentUser() u: U, @Param('enid') enid: string, @Body() dto: SetResultBody) {
    return this.meets.setResult(u.id, enid, dto);
  }
}
