import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StatsService } from './stats.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth.common';
import { PaginationQuery } from '../common/pagination';
import { Role } from '@prisma/client';

/** Parse a year query param to a sane value, or undefined (→ service defaults to the current year). */
function parseYear(year?: string): number | undefined {
  const n = year ? parseInt(year, 10) : NaN;
  return Number.isFinite(n) && n >= 2000 && n <= 2100 ? n : undefined;
}

@ApiTags('stats')
@ApiBearerAuth()
@Controller('stats')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StatsController {
  constructor(private stats: StatsService) {}

  @Get('heatmap')
  @Roles(Role.SWIMMER)
  heatmap(
    @CurrentUser() user: { id: string },
    @Query('year') year?: string,
  ) {
    const y = year ? parseInt(year, 10) : new Date().getUTCFullYear();
    return this.stats.heatmap(user.id, y);
  }

  @Get('summary')
  @Roles(Role.SWIMMER)
  summary(@CurrentUser() user: { id: string }) {
    return this.stats.summary(user.id);
  }

  @Get('overview')
  @Roles(Role.OWNER)
  overview(@CurrentUser() user: { id: string }) {
    return this.stats.overview(user.id);
  }

  @Get('pool/:id')
  @Roles(Role.OWNER)
  poolStats(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.stats.poolStats(user.id, id);
  }

  @Get('swimmer/:sid')
  @Roles(Role.OWNER)
  swimmerStats(@CurrentUser() user: { id: string }, @Param('sid') sid: string, @Query('year') year?: string) {
    return this.stats.swimmerStats(user.id, sid, parseYear(year));
  }

  @Get('swimmer/:sid/profile')
  @Roles(Role.OWNER)
  memberProfile(@CurrentUser() user: { id: string }, @Param('sid') sid: string) {
    return this.stats.memberProfile(user.id, sid);
  }

  @Get('swimmer/:sid/sessions')
  @Roles(Role.OWNER)
  memberSessions(
    @CurrentUser() user: { id: string },
    @Param('sid') sid: string,
    @Query() q: PaginationQuery,
    @Query('year') year?: string,
  ) {
    return this.stats.memberSessions(user.id, sid, parseYear(year), q.page, q.pageSize);
  }
}
