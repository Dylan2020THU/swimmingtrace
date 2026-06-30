import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Meets E2 seeding (e2e)', () => {
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

  it('排道：最快进末组中心道，第 7/8 名在 heat 1（6 道）', async () => {
    const owner = (
      await request(srv()).post('/auth/register').send({ email: 's-o@x.com', password: 'ownerpw123', role: 'OWNER' })
    ).body.accessToken;
    await prisma.user.update({ where: { email: 's-o@x.com' }, data: { plan: 'PRO' } });
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${owner}`);

    const pool = await auth(request(srv()).post('/pools').send({ name: 'P' })).expect(201);
    const pid = pool.body.id;
    const meet = await auth(request(srv()).post('/meets').send({ name: '排道赛', meetDate: '2026-06-30T00:00:00.000Z', laneCount: 6 })).expect(201);
    expect(meet.body.laneCount).toBe(6);
    const ev = await auth(request(srv()).post(`/meets/${meet.body.id}/events`).send({ distanceMeters: 50, stroke: 'FREE' })).expect(201);

    // 8 swimmers, seed times 1000..8000 (m0 fastest)
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      const sw = await auth(request(srv()).post(`/pools/${pid}/swimmers`).send({ email: `m${i}@x.com`, name: `M${i}`, gender: 'MALE', birthDate: '2012-03-01' })).expect(201);
      ids.push(sw.body.swimmerId);
      await auth(request(srv()).post(`/events/${ev.body.id}/entries`).send({ swimmerId: sw.body.swimmerId, seedTimeMs: (i + 1) * 1000 })).expect(201);
    }

    await auth(request(srv()).post(`/events/${ev.body.id}/seed`)).expect(200);
    const entries = (await auth(request(srv()).get(`/events/${ev.body.id}/entries`)).expect(200)).body;
    const bySwimmer = Object.fromEntries(entries.map((e: any) => [e.swimmerId, e]));

    // 2 heats (8 / 6). fastest m0 → heat 2, centre lane 3; m5 → heat 2, lane 6
    expect(bySwimmer[ids[0]]).toMatchObject({ heat: 2, lane: 3 });
    expect(bySwimmer[ids[5]]).toMatchObject({ heat: 2, lane: 6 });
    // 7th & 8th → heat 1, centre lanes 3,4
    expect(bySwimmer[ids[6]]).toMatchObject({ heat: 1, lane: 3 });
    expect(bySwimmer[ids[7]]).toMatchObject({ heat: 1, lane: 4 });
  });
});
