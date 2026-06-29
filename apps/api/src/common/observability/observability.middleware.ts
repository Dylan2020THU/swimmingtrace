import { Injectable, NestMiddleware } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from '../../metrics/metrics.service';
import { buildAuditEntry, isMutating } from './audit';

export interface AuditLogger {
  info(obj: object, msg?: string): void;
}

/**
 * On response finish: record HTTP metrics for every request and emit a
 * structured audit log for mutating requests. Pure factory so the behaviour is
 * unit-testable without the Nest container.
 */
export function observabilityMiddleware(metrics: MetricsService, logger: AuditLogger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const route = ((req as Request & { route?: { path?: string } }).route?.path) ?? 'unmatched';
      metrics.observe(req.method, route, res.statusCode, durationMs);
      if (isMutating(req.method)) {
        logger.info(buildAuditEntry(req as Parameters<typeof buildAuditEntry>[0], res, durationMs), 'audit');
      }
    });
    next();
  };
}

/** DI wrapper so AppModule.configure() can apply the middleware to all routes. */
@Injectable()
export class ObservabilityMiddleware implements NestMiddleware {
  private readonly handler: (req: Request, res: Response, next: NextFunction) => void;

  constructor(metrics: MetricsService, logger: PinoLogger) {
    this.handler = observabilityMiddleware(metrics, logger);
  }

  use(req: Request, res: Response, next: NextFunction): void {
    this.handler(req, res, next);
  }
}
