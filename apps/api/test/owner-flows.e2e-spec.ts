import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Owner flows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.swimSession.deleteMany();
    await prisma.registration.deleteMany();
    await prisma.pool.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => { await app.close(); });

  const reg = (email: string) =>
    request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123', role: 'OWNER' });

  it('owner A 不能访问 owner B 的泳池 → 403', async () => {
    const a = (await reg('a@x.com')).body.accessToken;
    const b = (await reg('b@x.com')).body.accessToken;
    const poolB = await request(app.getHttpServer()).post('/pools').set('Authorization', `Bearer ${b}`).send({ name: 'B-Pool' }).expect(201);
    await request(app.getHttpServer())
      .get(`/pools/${poolB.body.id}`).set('Authorization', `Bearer ${a}`)
      .expect(403);
  });

  it('建会员 + 代录 happy path', async () => {
    const a = (await reg('owner@x.com')).body.accessToken;
    const pool = await request(app.getHttpServer()).post('/pools').set('Authorization', `Bearer ${a}`).send({ name: 'A-Pool' }).expect(201);
    const swimmer = await request(app.getHttpServer())
      .post(`/pools/${pool.body.id}/swimmers`).set('Authorization', `Bearer ${a}`)
      .send({ name: 'Sam', email: 'sam@x.com' }).expect(201);
    expect(swimmer.body.email).toBe('sam@x.com');
    await request(app.getHttpServer())
      .post(`/pools/${pool.body.id}/swimmers/${swimmer.body.swimmerId}/sessions`)
      .set('Authorization', `Bearer ${a}`)
      .send({ distanceMeters: 1000, swamAt: '2026-02-01T08:00:00.000Z' }).expect(201);
    const stats = await request(app.getHttpServer())
      .get(`/stats/swimmer/${swimmer.body.swimmerId}`).set('Authorization', `Bearer ${a}`).expect(200);
    expect(stats.body.summary.totalDistanceMeters).toBe(1000);
  });
});
