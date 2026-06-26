import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { CurrentUser, JwtAuthGuard } from '../common/auth.common';

@Controller('stats')
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(private stats: StatsService) {}

  @Get('heatmap')
  heatmap(
    @CurrentUser() user: { id: string },
    @Query('year') year?: string,
  ) {
    const y = year ? parseInt(year, 10) : new Date().getUTCFullYear();
    return this.stats.heatmap(user.id, y);
  }

  @Get('summary')
  summary(@CurrentUser() user: { id: string }) {
    return this.stats.summary(user.id);
  }
}
