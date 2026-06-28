import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupSwagger } from '../src/swagger';

describe('OpenAPI docs (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/docs-json 暴露 OpenAPI（路径 + Bearer 安全方案）', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(res.body.openapi).toBeTruthy();
    expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining(['/auth/login', '/pools', '/health']));
    expect(res.body.components?.securitySchemes).toHaveProperty('bearer');
  });
});
