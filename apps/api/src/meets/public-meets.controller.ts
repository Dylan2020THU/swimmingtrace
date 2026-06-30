import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MeetsService } from './meets.service';

/** Unauthenticated, PII-safe projections for PUBLISHED meets. Throttled globally. */
@ApiTags('public')
@Controller('public')
export class PublicMeetsController {
  constructor(private meets: MeetsService) {}

  @Get('meets/:id')
  meet(@Param('id') id: string) {
    return this.meets.publicMeet(id);
  }

  @Get('events/:eid/startlist')
  startlist(@Param('eid') eid: string) {
    return this.meets.publicStartList(eid);
  }

  @Get('events/:eid/results')
  results(@Param('eid') eid: string) {
    return this.meets.publicResults(eid);
  }
}
