import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaHealthIndicator } from './prisma.health';

/** Public, un-throttled probes for orchestrators / load balancers. */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
  ) {}

  /** Liveness: the process is up. Does not touch the DB. */
  @Get()
  liveness() {
    return { status: 'ok' };
  }

  /** Readiness: the DB is reachable (200) or not (503). */
  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([() => this.prismaIndicator.isHealthy('database')]);
  }
}
