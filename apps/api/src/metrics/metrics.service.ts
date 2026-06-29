import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Owns an isolated prom-client Registry (per instance, so tests never collide
 * on "metric already registered"). Exposes process metrics plus an HTTP request
 * histogram + counter, recorded by the observability middleware.
 */
@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly duration: Histogram<string>;
  private readonly total: Counter<string>;

  constructor() {
    collectDefaultMetrics({ register: this.registry });
    this.duration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });
    this.total = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });
  }

  observe(method: string, route: string, statusCode: number, durationMs: number): void {
    const labels = { method, route, status_code: String(statusCode) };
    this.duration.observe(labels, durationMs / 1000);
    this.total.inc(labels);
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }
}
