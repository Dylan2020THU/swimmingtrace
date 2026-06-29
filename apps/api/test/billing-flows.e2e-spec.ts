import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Billing plans & quotas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.idempotencyKey.deleteMany();
    await prisma.challenge.deleteMany();
    await prisma.swimSession.deleteMany();
    await prisma.registration.deleteMany();
    await prisma.pool.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  const srv = () => app.getHttpServer();

  it('FREE 配额/门禁 → 402；升级 PRO 放行；降级祖父化', async () => {
    const owner = (
      await request(srv()).post('/auth/register').send({ email: 'bill-o@x.com', password: 'ownerpw123', role: 'OWNER' })
    ).body.accessToken;
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${owner}`);

    // 初始 FREE
    const p0 = await auth(request(srv()).get('/account/plan')).expect(200);
    expect(p0.body).toMatchObject({
      plan: 'FREE',
      limits: { maxPools: 1, maxMembers: 25 },
      usage: { pools: 0, members: 0 },
      features: { export: false, challenges: false },
    });

    // 泳池配额：第 1 个 OK，第 2 个 → 402
    const pool = await auth(request(srv()).post('/pools').send({ name: 'P1' })).expect(201);
    await auth(request(srv()).post('/pools').send({ name: 'P2' })).expect(402);

    // 功能门禁（FREE 无导出/挑战）
    await auth(request(srv()).get('/account/export')).expect(402);
    const challengeBody = { name: 'C', goalDistanceMeters: 5000, startDate: '2026-05-01T00:00:00.000Z', endDate: '2026-06-01T00:00:00.000Z' };
    await auth(request(srv()).post(`/pools/${pool.body.id}/challenges`).send(challengeBody)).expect(402);

    // 会员配额：建 25 个 OK，第 26 个 → 402
    for (let i = 0; i < 25; i++) {
      await auth(request(srv()).post(`/pools/${pool.body.id}/swimmers`).send({ email: `m${i}@x.com` })).expect(201);
    }
    await auth(request(srv()).post(`/pools/${pool.body.id}/swimmers`).send({ email: 'm25@x.com' })).expect(402);

    // 升级 PRO
    const up = await auth(request(srv()).post('/account/plan').send({ plan: 'PRO' })).expect(201);
    expect(up.body).toMatchObject({ plan: 'PRO', features: { export: true, challenges: true } });

    // 放行：第 2 个泳池、导出、挑战
    await auth(request(srv()).post('/pools').send({ name: 'P2' })).expect(201);
    await auth(request(srv()).get('/account/export')).expect(200);
    await auth(request(srv()).post(`/pools/${pool.body.id}/challenges`).send(challengeBody)).expect(201);

    // plan 反映用量
    const p1 = await auth(request(srv()).get('/account/plan')).expect(200);
    expect(p1.body).toMatchObject({ plan: 'PRO', usage: { pools: 2, members: 25 } });

    // 降级 FREE：祖父化（既有保留），但新建受限
    await auth(request(srv()).post('/account/plan').send({ plan: 'FREE' })).expect(201);
    const p2 = await auth(request(srv()).get('/account/plan')).expect(200);
    expect(p2.body.plan).toBe('FREE');
    expect(p2.body.usage.pools).toBe(2); // 祖父化：超过 FREE 上限 1 仍保留
    await auth(request(srv()).post('/pools').send({ name: 'P3' })).expect(402);
  });

  it('非法 plan 值 → 400', async () => {
    const owner = (
      await request(srv()).post('/auth/register').send({ email: 'bill-o2@x.com', password: 'ownerpw123', role: 'OWNER' })
    ).body.accessToken;
    await request(srv()).post('/account/plan').set('Authorization', `Bearer ${owner}`).send({ plan: 'ENTERPRISE' }).expect(400);
  });
});
