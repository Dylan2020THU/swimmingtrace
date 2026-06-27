import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Challenges & leaderboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
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
  const regOwner = (email: string) =>
    request(srv()).post('/auth/register').send({ email, password: 'password123', role: 'OWNER' });
  const year = new Date().getUTCFullYear();

  it('建挑战→代录→排行榜/进度正确，游泳者看到自己的名次，越权 403', async () => {
    const owner = (await regOwner('o@x.com')).body.accessToken;
    const oh = { Authorization: `Bearer ${owner}` };
    const pool = await request(srv()).post('/pools').set(oh).send({ name: 'P' }).expect(201);

    const sam = await request(srv()).post(`/pools/${pool.body.id}/swimmers`).set(oh).send({ name: 'Sam', email: 'sam@x.com' }).expect(201);
    const bob = await request(srv()).post(`/pools/${pool.body.id}/swimmers`).set(oh).send({ name: 'Bob', email: 'bob@x.com' }).expect(201);

    const rec = (sid: string, dist: number) =>
      request(srv()).post(`/pools/${pool.body.id}/swimmers/${sid}/sessions`).set(oh)
        .send({ distanceMeters: dist, swamAt: `${year}-06-15T08:00:00.000Z` }).expect(201);
    await rec(sam.body.swimmerId, 1000);
    await rec(bob.body.swimmerId, 500);

    const challenge = await request(srv()).post(`/pools/${pool.body.id}/challenges`).set(oh)
      .send({ name: '夏季挑战', goalDistanceMeters: 10000, startDate: `${year}-01-01`, endDate: `${year + 1}-01-01` })
      .expect(201);

    // list with progress
    const list = await request(srv()).get(`/pools/${pool.body.id}/challenges`).set(oh).expect(200);
    expect(list.body[0]).toMatchObject({ id: challenge.body.id, totalDistanceMeters: 1500 });

    // detail + leaderboard
    const detail = await request(srv()).get(`/challenges/${challenge.body.id}`).set(oh).expect(200);
    expect(detail.body.totalDistanceMeters).toBe(1500);
    expect(detail.body.leaderboard.map((r: any) => [r.email, r.distanceMeters])).toEqual([
      ['sam@x.com', 1000],
      ['bob@x.com', 500],
    ]);

    // swimmer claims and sees own rank
    const token = (await request(srv()).post(`/pools/${pool.body.id}/swimmers/${sam.body.swimmerId}/claim-link`).set(oh).expect(201)).body.claimToken;
    const swToken = (await request(srv()).post('/auth/claim').send({ token, password: 'sampw1234' }).expect(201)).body.accessToken;
    const mine = await request(srv()).get('/me/challenges').set({ Authorization: `Bearer ${swToken}` }).expect(200);
    expect(mine.body[0]).toMatchObject({ id: challenge.body.id, myDistanceMeters: 1000, myRank: 1, totalDistanceMeters: 1500 });

    // event-mode surface: GET /challenges/active includes the running challenge with poolName+progress
    const active = await request(srv()).get('/challenges/active').set(oh).expect(200);
    expect(active.body.find((a: any) => a.id === challenge.body.id)).toMatchObject({ poolName: 'P', totalDistanceMeters: 1500 });

    // a finished challenge (window in the past) is NOT active
    const past = await request(srv()).post(`/pools/${pool.body.id}/challenges`).set(oh)
      .send({ name: '去年挑战', goalDistanceMeters: 100, startDate: `${year - 1}-01-01`, endDate: `${year - 1}-02-01` }).expect(201);
    const active2 = await request(srv()).get('/challenges/active').set(oh).expect(200);
    expect(active2.body.map((a: any) => a.id)).not.toContain(past.body.id);

    // a not-yet-started (future) challenge is NOT active either
    const future = await request(srv()).post(`/pools/${pool.body.id}/challenges`).set(oh)
      .send({ name: '明年挑战', goalDistanceMeters: 100, startDate: `${year + 1}-01-01`, endDate: `${year + 2}-01-01` }).expect(201);
    const active3 = await request(srv()).get('/challenges/active').set(oh).expect(200);
    expect(active3.body.map((a: any) => a.id)).not.toContain(future.body.id);

    // another owner cannot view this challenge
    const other = (await regOwner('other@x.com')).body.accessToken;
    await request(srv()).get(`/challenges/${challenge.body.id}`).set({ Authorization: `Bearer ${other}` }).expect(403);
  });

  it('endDate<=startDate → 400', async () => {
    const owner = (await regOwner('o3@x.com')).body.accessToken;
    const oh = { Authorization: `Bearer ${owner}` };
    const pool = await request(srv()).post('/pools').set(oh).send({ name: 'Q' }).expect(201);
    await request(srv()).post(`/pools/${pool.body.id}/challenges`).set(oh)
      .send({ name: 'X', goalDistanceMeters: 100, startDate: `${year}-06-01`, endDate: `${year}-06-01` })
      .expect(400);
  });
});
