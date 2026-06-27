import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Swimmer claim & self-record (e2e)', () => {
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

  afterAll(async () => {
    await app.close();
  });

  const srv = () => app.getHttpServer();
  const regOwner = (email: string) =>
    request(srv()).post('/auth/register').send({ email, password: 'password123', role: 'OWNER' });

  it('owner 建游泳者→生成认领链接→认领→自录→入 owner 单泳池看板', async () => {
    const owner = (await regOwner('o@x.com')).body.accessToken;
    const pool = await request(srv()).post('/pools').set('Authorization', `Bearer ${owner}`).send({ name: 'P' }).expect(201);
    const sw = await request(srv())
      .post(`/pools/${pool.body.id}/swimmers`).set('Authorization', `Bearer ${owner}`)
      .send({ name: 'Sam', email: 'sam@x.com' }).expect(201);

    const link = await request(srv())
      .post(`/pools/${pool.body.id}/swimmers/${sw.body.swimmerId}/claim-link`)
      .set('Authorization', `Bearer ${owner}`).expect(201);
    const token = link.body.claimToken;
    expect(link.body.claimUrl).toContain(`/claim/${token}`);

    const info = await request(srv()).get(`/auth/claim/${token}`).expect(200);
    expect(info.body.email).toBe('sam@x.com');

    const claimed = await request(srv()).post('/auth/claim').send({ token, password: 'swimmerpw1' }).expect(201);
    const swToken = claimed.body.accessToken;

    const myPools = await request(srv()).get('/me/pools').set('Authorization', `Bearer ${swToken}`).expect(200);
    expect(myPools.body).toEqual([{ id: pool.body.id, name: 'P' }]);

    const day = `${new Date().getUTCFullYear()}-03-01`;
    await request(srv())
      .post('/sessions').set('Authorization', `Bearer ${swToken}`)
      .send({ distanceMeters: 1500, swamAt: `${day}T08:00:00.000Z`, poolId: pool.body.id }).expect(201);

    const ps = await request(srv()).get(`/stats/pool/${pool.body.id}`).set('Authorization', `Bearer ${owner}`).expect(200);
    expect(ps.body.heatmap).toContainEqual({ date: day, distanceMeters: 1500 });
  });

  it('坏令牌→404；用过的令牌再认领→404（链接已失效）；非成员池自录→403', async () => {
    await request(srv()).get('/auth/claim/nope').expect(404);

    const owner = (await regOwner('o2@x.com')).body.accessToken;
    const pool = await request(srv()).post('/pools').set('Authorization', `Bearer ${owner}`).send({ name: 'Q' }).expect(201);
    const sw = await request(srv())
      .post(`/pools/${pool.body.id}/swimmers`).set('Authorization', `Bearer ${owner}`)
      .send({ email: 'bob@x.com' }).expect(201);
    const token = (await request(srv())
      .post(`/pools/${pool.body.id}/swimmers/${sw.body.swimmerId}/claim-link`)
      .set('Authorization', `Bearer ${owner}`).expect(201)).body.claimToken;

    const swToken = (await request(srv()).post('/auth/claim').send({ token, password: 'bobpw1234' }).expect(201)).body.accessToken;
    // Claim consumes (clears) the token, so reusing it is an invalid link → 404.
    await request(srv()).post('/auth/claim').send({ token, password: 'again1234' }).expect(404);

    await request(srv())
      .post('/sessions').set('Authorization', `Bearer ${swToken}`)
      .send({ distanceMeters: 100, swamAt: `${new Date().getUTCFullYear()}-03-02T08:00:00.000Z`, poolId: '00000000-0000-0000-0000-000000000000' })
      .expect(403);
  });

  it('防接管：owner 不能把他人 OWNER 邮箱加为游泳者 → 409', async () => {
    await regOwner('victim@x.com').expect(201); // victim 是一个 OWNER 账号
    const attacker = (await regOwner('attacker@x.com')).body.accessToken;
    const pool = await request(srv()).post('/pools').set('Authorization', `Bearer ${attacker}`).send({ name: 'Evil' }).expect(201);
    await request(srv())
      .post(`/pools/${pool.body.id}/swimmers`).set('Authorization', `Bearer ${attacker}`)
      .send({ email: 'victim@x.com' }).expect(409);
  });
});
