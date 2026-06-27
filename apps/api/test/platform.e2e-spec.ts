import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Platform (e2e)', () => {
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

  it('GET /health → 200 {status:ok}，无需鉴权', async () => {
    const res = await request(srv()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready → 200，库在线', async () => {
    const res = await request(srv()).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('未知路由 → 404 信封，含 path + requestId', async () => {
    const res = await request(srv()).get('/no-such-route');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ statusCode: 404, path: '/no-such-route' });
    expect(typeof res.body.requestId).toBe('string');
    expect(res.body.requestId.length).toBeGreaterThan(0);
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('未鉴权访问受保护路由 → 401 信封', async () => {
    const res = await request(srv()).get('/pools');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ statusCode: 401, path: '/pools' });
    expect(res.body.requestId).toBeTruthy();
  });

  it('回显入站 x-request-id', async () => {
    const res = await request(srv()).get('/health').set('x-request-id', 'trace-xyz');
    expect(res.headers['x-request-id']).toBe('trace-xyz');
  });
});
