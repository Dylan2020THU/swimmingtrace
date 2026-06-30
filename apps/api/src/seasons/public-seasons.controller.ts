import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SeasonsService } from './seasons.service';

/** Unauthenticated, PII-safe projections for PUBLISHED seasons. Throttled globally. */
@ApiTags('public')
@Controller('public')
export class PublicSeasonsController {
  constructor(private seasons: SeasonsService) {}

  @Get('seasons/:id')
  season(@Param('id') id: string) {
    return this.seasons.publicSeason(id);
  }

  @Get('seasons/:id/records')
  records(@Param('id') id: string) {
    return this.seasons.publicSeasonRecords(id);
  }
}
