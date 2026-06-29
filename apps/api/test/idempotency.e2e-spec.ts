import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Idempotency-Key (e2e)', () => {
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

  it('同 key 重放不产生重复；改载荷 → 422；换 key → 新建', async () => {
    const owner = (
      await request(srv()).post('/auth/register').send({ email: 'io@x.com', password: 'password123', role: 'OWNER' })
    ).body.accessToken;
    const pool = await request(srv()).post('/pools').set('Authorization', `Bearer ${owner}`).send({ name: 'IP' }).expect(201);
    const sw = await request(srv())
      .post(`/pools/${pool.body.id}/swimmers`).set('Authorization', `Bearer ${owner}`)
      .send({ name: 'Ida', email: 'ida@x.com' }).expect(201);
    const token = (
      await request(srv())
        .post(`/pools/${pool.body.id}/swimmers/${sw.body.swimmerId}/claim-link`)
        .set('Authorization', `Bearer ${owner}`).expect(201)
    ).body.claimToken;
    const swToken = (
      await request(srv()).post('/auth/claim').send({ token, password: 'idapw1234' }).expect(201)
    ).body.accessToken;

    const day = `${new Date().getUTCFullYear()}-04-01`;
    const payload = { distanceMeters: 1200, swamAt: `${day}T08:00:00.000Z`, poolId: pool.body.id };

    // First request with an Idempotency-Key.
    const first = await request(srv())
      .post('/sessions').set('Authorization', `Bearer ${swToken}`).set('Idempotency-Key', 'key-1')
      .send(payload).expect(201);
    expect(first.body.id).toBeTruthy();

    // Replay: same key + same payload → identical response, no duplicate.
    const replay = await request(srv())
      .post('/sessions').set('Authorization', `Bearer ${swToken}`).set('Idempotency-Key', 'key-1')
      .send(payload).expect(201);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body).toEqual(first.body);

    const hist = await request(srv()).get('/sessions/me').set('Authorization', `Bearer ${swToken}`).expect(200);
    expect(hist.body.total).toBe(1);

    // Same key, different payload → 422.
    await request(srv())
      .post('/sessions').set('Authorization', `Bearer ${swToken}`).set('Idempotency-Key', 'key-1')
      .send({ ...payload, distanceMeters: 9999 }).expect(422);

    // Different key → a genuinely new session.
    await request(srv())
      .post('/sessions').set('Authorization', `Bearer ${swToken}`).set('Idempotency-Key', 'key-2')
      .send(payload).expect(201);
    const hist2 = await request(srv()).get('/sessions/me').set('Authorization', `Bearer ${swToken}`).expect(200);
    expect(hist2.body.total).toBe(2);
  });

  it('进行中（completedAt 为空）的同 key → 409', async () => {
    const owner = (
      await request(srv()).post('/auth/register').send({ email: 'io2@x.com', password: 'password123', role: 'OWNER' })
    ).body.accessToken;
    const me = await request(srv()).get('/auth/me').set('Authorization', `Bearer ${owner}`).expect(200);

    // Simulate an in-flight request by pre-inserting a pending key row for this user.
    await prisma.idempotencyKey.create({
      data: { userId: me.body.id, key: 'inflight', method: 'POST', path: '/pools', requestHash: 'x' },
    });

    await request(srv())
      .post('/pools').set('Authorization', `Bearer ${owner}`).set('Idempotency-Key', 'inflight')
      .send({ name: 'Whatever' }).expect(409);
  });
});
