import { Controller, Get, NotFoundException, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';

/** Prometheus scrape endpoint. Public + un-throttled; restrict via network policy in prod. */
@ApiExcludeController()
@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async scrape(@Res() res: Response): Promise<void> {
    if (this.config.get<string>('METRICS_ENABLED') === 'false') {
      throw new NotFoundException();
    }
    res.type(this.metrics.contentType).send(await this.metrics.render());
  }
}
