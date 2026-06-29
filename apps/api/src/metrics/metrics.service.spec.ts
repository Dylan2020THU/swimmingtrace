import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('observe 后 render 含 http 指标与标签值', async () => {
    const m = new MetricsService();
    m.observe('GET', '/health', 200, 12);
    const text = await m.render();
    expect(text).toContain('http_requests_total');
    expect(text).toMatch(/http_requests_total\{[^}]*method="GET"[^}]*route="\/health"[^}]*\}/);
    expect(text).toContain('http_request_duration_seconds');
  });

  it('含默认进程指标', async () => {
    const m = new MetricsService();
    const text = await m.render();
    expect(text).toMatch(/process_/);
  });

  it('多实例并存不抛 already registered', () => {
    expect(() => {
      new MetricsService();
      new MetricsService();
    }).not.toThrow();
  });
});
