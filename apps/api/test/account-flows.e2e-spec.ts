import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Account export & deletion (e2e)', () => {
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

  it('导出完整数据图；密码确认删除账号；删除后 owner 登录失败、会员账号仍在但已脱离该池', async () => {
    const owner = (
      await request(srv()).post('/auth/register').send({ email: 'acc-o@x.com', password: 'ownerpw123', role: 'OWNER' })
    ).body.accessToken;
    const pool = await request(srv()).post('/pools').set('Authorization', `Bearer ${owner}`).send({ name: 'AccPool' }).expect(201);
    const sw = await request(srv())
      .post(`/pools/${pool.body.id}/swimmers`).set('Authorization', `Bearer ${owner}`)
      .send({ name: 'Ada', email: 'ada@x.com' }).expect(201);
    const token = (
      await request(srv())
        .post(`/pools/${pool.body.id}/swimmers/${sw.body.swimmerId}/claim-link`)
        .set('Authorization', `Bearer ${owner}`).expect(201)
    ).body.claimToken;
    const swToken = (
      await request(srv()).post('/auth/claim').send({ token, password: 'adapw1234' }).expect(201)
    ).body.accessToken;

    const day = `${new Date().getUTCFullYear()}-05-01`;
    await request(srv())
      .post('/sessions').set('Authorization', `Bearer ${swToken}`)
      .send({ distanceMeters: 800, swamAt: `${day}T08:00:00.000Z`, poolId: pool.body.id }).expect(201);
    await request(srv())
      .post(`/pools/${pool.body.id}/challenges`).set('Authorization', `Bearer ${owner}`)
      .send({ name: 'Spring', goalDistanceMeters: 5000, startDate: `${day}T00:00:00.000Z`, endDate: `${new Date().getUTCFullYear()}-06-01T00:00:00.000Z` })
      .expect(201);

    // Export the full graph.
    const exp = await request(srv()).get('/account/export').set('Authorization', `Bearer ${owner}`).expect(200);
    expect(exp.body.account).toMatchObject({ email: 'acc-o@x.com', role: 'OWNER' });
    expect(exp.body.pools).toHaveLength(1);
    expect(exp.body.pools[0].swimmers.find((s: { email: string }) => s.email === 'ada@x.com')).toBeTruthy();
    expect(exp.body.pools[0].sessions[0].distanceMeters).toBe(800);
    expect(exp.body.pools[0].challenges[0].name).toBe('Spring');

    // Deletion requires the correct password.
    await request(srv()).delete('/account').set('Authorization', `Bearer ${owner}`).send({ password: 'wrong' }).expect(401);

    await request(srv()).delete('/account').set('Authorization', `Bearer ${owner}`).send({ password: 'ownerpw123' }).expect(200);

    // Owner account is gone → login fails.
    await request(srv()).post('/auth/login').send({ email: 'acc-o@x.com', password: 'ownerpw123' }).expect(401);

    // The swimmer is an independent account → still logs in, but no longer in the (deleted) pool.
    const swLogin = await request(srv()).post('/auth/login').send({ email: 'ada@x.com', password: 'adapw1234' }).expect(201);
    const myPools = await request(srv()).get('/me/pools').set('Authorization', `Bearer ${swLogin.body.accessToken}`).expect(200);
    expect(myPools.body).toEqual([]);
  });
});
