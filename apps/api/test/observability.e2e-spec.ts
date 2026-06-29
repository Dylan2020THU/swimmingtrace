import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Observability (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const srv = () => app.getHttpServer();

  it('GET /metrics 暴露 Prometheus 文本（含 http 与进程指标），无需鉴权', async () => {
    // 先打一个被计量的请求，确保 http_requests_total 有样本。
    await request(srv()).get('/health').expect(200);

    const res = await request(srv()).get('/metrics').expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('http_requests_total');
    expect(res.text).toContain('http_request_duration_seconds');
    expect(res.text).toMatch(/process_/);
  });
});
