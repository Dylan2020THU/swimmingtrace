import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Member profile (owner-facing /stats/swimmer/:sid) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.meetEntry.deleteMany();
    await prisma.raceEvent.deleteMany();
    await prisma.meet.deleteMany();
    await prisma.season.deleteMany();
    await prisma.apiKey.deleteMany();
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
  const reg = (email: string) =>
    request(srv()).post('/auth/register').send({ email, password: 'password123', role: 'OWNER' });

  it('profile + sessions：owner 视角，scoped 到本人泳池 + 倒序分页 + poolName', async () => {
    const a = (await reg('mp-owner@x.com')).body.accessToken;
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${a}`);
    const pool = (await auth(request(srv()).post('/pools').send({ name: 'MP-Pool' })).expect(201)).body;
    const sw = (await auth(request(srv()).post(`/pools/${pool.id}/swimmers`).send({ email: 'mp@x.com', name: 'MP', gender: 'MALE', birthDate: '2012-01-01' })).expect(201)).body;
    const yr = new Date().getUTCFullYear();
    await auth(request(srv()).post(`/pools/${pool.id}/swimmers/${sw.swimmerId}/sessions`).send({ distanceMeters: 1000, swamAt: `${yr}-02-01T08:00:00.000Z` })).expect(201);
    await auth(request(srv()).post(`/pools/${pool.id}/swimmers/${sw.swimmerId}/sessions`).send({ distanceMeters: 2000, swamAt: `${yr}-03-01T08:00:00.000Z` })).expect(201);

    const profile = (await auth(request(srv()).get(`/stats/swimmer/${sw.swimmerId}/profile`)).expect(200)).body;
    expect(profile).toMatchObject({ swimmerId: sw.swimmerId, name: 'MP', email: 'mp@x.com', gender: 'MALE' });
    expect(profile.pools.map((p: { poolName: string }) => p.poolName)).toContain('MP-Pool');

    const sessions = (await auth(request(srv()).get(`/stats/swimmer/${sw.swimmerId}/sessions?year=${yr}`)).expect(200)).body;
    expect(sessions).toMatchObject({ total: 2, page: 1 });
    expect(sessions.items[0].swamAt > sessions.items[1].swamAt).toBe(true); // 倒序
    expect(sessions.items[0].poolName).toBe('MP-Pool');

    // year filter excludes other years
    const empty = (await auth(request(srv()).get(`/stats/swimmer/${sw.swimmerId}/sessions?year=${yr - 5}`)).expect(200)).body;
    expect(empty.total).toBe(0);
  });

  it('跨 owner 访问会员 profile/sessions → 403', async () => {
    const a = (await reg('mp-a@x.com')).body.accessToken;
    const b = (await reg('mp-b@x.com')).body.accessToken;
    const poolA = (await request(srv()).post('/pools').set('Authorization', `Bearer ${a}`).send({ name: 'A' }).expect(201)).body;
    const sw = (await request(srv()).post(`/pools/${poolA.id}/swimmers`).set('Authorization', `Bearer ${a}`).send({ email: 'mpx@x.com' }).expect(201)).body;
    await request(srv()).get(`/stats/swimmer/${sw.swimmerId}/profile`).set('Authorization', `Bearer ${b}`).expect(403);
    await request(srv()).get(`/stats/swimmer/${sw.swimmerId}/sessions`).set('Authorization', `Bearer ${b}`).expect(403);
  });
});
