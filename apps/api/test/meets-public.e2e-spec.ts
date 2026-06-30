import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Meets E3 public pages (e2e)', () => {
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

  it('发布后公开页可访问且无 email；未发布 → 404', async () => {
    const owner = (
      await request(srv()).post('/auth/register').send({ email: 'p-o@x.com', password: 'ownerpw123', role: 'OWNER' })
    ).body.accessToken;
    await prisma.user.update({ where: { email: 'p-o@x.com' }, data: { plan: 'PRO' } });
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${owner}`);

    const pool = await auth(request(srv()).post('/pools').send({ name: 'P' })).expect(201);
    const sam = (await auth(request(srv()).post(`/pools/${pool.body.id}/swimmers`).send({ email: 'sam@x.com', name: 'Sam', gender: 'MALE', birthDate: '2012-03-01' })).expect(201)).body.swimmerId;
    const bob = (await auth(request(srv()).post(`/pools/${pool.body.id}/swimmers`).send({ email: 'bob@x.com', name: 'Bob', gender: 'MALE', birthDate: '2012-09-01' })).expect(201)).body.swimmerId;

    const meet = await auth(request(srv()).post('/meets').send({ name: '公开赛', meetDate: '2026-06-30T00:00:00.000Z', laneCount: 6 })).expect(201);
    const mid = meet.body.id;
    const ev = await auth(request(srv()).post(`/meets/${mid}/events`).send({ distanceMeters: 50, stroke: 'FREE' })).expect(201);
    const eid = ev.body.id;
    const e1 = await auth(request(srv()).post(`/events/${eid}/entries`).send({ swimmerId: sam, seedTimeMs: 28760 })).expect(201);
    const e2 = await auth(request(srv()).post(`/events/${eid}/entries`).send({ swimmerId: bob, seedTimeMs: 29340 })).expect(201);
    await auth(request(srv()).post(`/events/${eid}/seed`)).expect(200);
    await auth(request(srv()).patch(`/entries/${e1.body.id}/result`).send({ resultStatus: 'OK', resultTimeMs: 28760 })).expect(200);
    await auth(request(srv()).patch(`/entries/${e2.body.id}/result`).send({ resultStatus: 'OK', resultTimeMs: 29340 })).expect(200);

    // not published → public 404 (no auth header)
    await request(srv()).get(`/public/meets/${mid}`).expect(404);

    // publish
    const pub = await auth(request(srv()).post(`/meets/${mid}/publish`).send({ published: true })).expect(200);
    expect(pub.body).toEqual({ published: true });

    // public meet (unauthenticated)
    const pm = await request(srv()).get(`/public/meets/${mid}`).expect(200);
    expect(pm.body).toMatchObject({ name: '公开赛', laneCount: 6 });
    expect(pm.body.events).toHaveLength(1);

    // public start list — has names/lanes, NO email
    const sl = await request(srv()).get(`/public/events/${eid}/startlist`).expect(200);
    expect(sl.body[0].entries.find((x: any) => x.name === 'Sam')).toMatchObject({ lane: 3 });
    expect(JSON.stringify(sl.body)).not.toContain('@');

    // public results — has rank/medal, NO email
    const res = await request(srv()).get(`/public/events/${eid}/results`).expect(200);
    expect(res.body[0].rows.find((r: any) => r.name === 'Sam')).toMatchObject({ rank: 1, medal: 'gold' });
    expect(JSON.stringify(res.body)).not.toContain('@');

    // unpublish → public 404 again
    await auth(request(srv()).post(`/meets/${mid}/publish`).send({ published: false })).expect(200);
    await request(srv()).get(`/public/meets/${mid}`).expect(404);
    await request(srv()).get(`/public/events/${eid}/startlist`).expect(404);
  });
});
