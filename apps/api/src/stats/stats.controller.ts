import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StatsService } from './stats.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth.common';
import { Role } from '@prisma/client';

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
  swimmerStats(@CurrentUser() user: { id: string }, @Param('sid') sid: string) {
    return this.stats.swimmerStats(user.id, sid);
  }
}
