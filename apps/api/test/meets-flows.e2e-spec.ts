import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Meets E1 (e2e)', () => {
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

  it('建赛→加项目→报名(需人口学)→录成绩→按 性别×年龄组 排名+奖牌；DNS 不计名次', async () => {
    const owner = (
      await request(srv()).post('/auth/register').send({ email: 'm-o@x.com', password: 'ownerpw123', role: 'OWNER' })
    ).body.accessToken;
    await prisma.user.update({ where: { email: 'm-o@x.com' }, data: { plan: 'PRO' } });
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${owner}`);

    const pool = await auth(request(srv()).post('/pools').send({ name: 'P' })).expect(201);
    const pid = pool.body.id;
    const mk = (email: string, body: object) =>
      auth(request(srv()).post(`/pools/${pid}/swimmers`).send({ email, ...body })).expect(201).then((r) => r.body.swimmerId);
    const sam = await mk('sam@x.com', { name: 'Sam', gender: 'MALE', birthDate: '2012-05-01' }); // 14 on meet date
    const bob = await mk('bob@x.com', { name: 'Bob', gender: 'MALE', birthDate: '2012-08-01' }); // 13 on meet date
    const nd = await mk('nd@x.com', { name: 'NoDemo' }); // 无 gender/birthDate

    const meet = await auth(request(srv()).post('/meets').send({ name: '夏季赛', meetDate: '2026-06-30T00:00:00.000Z' })).expect(201);
    expect(meet.body).toMatchObject({ name: '夏季赛', eventCount: 0 });
    const mid = meet.body.id;

    const ev = await auth(request(srv()).post(`/meets/${mid}/events`).send({ distanceMeters: 50, stroke: 'FREE' })).expect(201);
    const eid = ev.body.id;

    const e1 = await auth(request(srv()).post(`/events/${eid}/entries`).send({ swimmerId: sam })).expect(201);
    const e2 = await auth(request(srv()).post(`/events/${eid}/entries`).send({ swimmerId: bob })).expect(201);
    // 缺人口学 → 422
    await auth(request(srv()).post(`/events/${eid}/entries`).send({ swimmerId: nd })).expect(422);

    // 录成绩
    await auth(request(srv()).patch(`/entries/${e1.body.id}/result`).send({ resultStatus: 'OK', resultTimeMs: 30000 })).expect(200);
    await auth(request(srv()).patch(`/entries/${e2.body.id}/result`).send({ resultStatus: 'OK', resultTimeMs: 31000 })).expect(200);

    const st = await auth(request(srv()).get(`/events/${eid}/standings`)).expect(200);
    expect(st.body).toHaveLength(1);
    expect(st.body[0]).toMatchObject({ gender: 'MALE', ageGroup: '9至14岁' });
    expect(st.body[0].rows.map((r: any) => [r.name, r.rank, r.medal])).toEqual([
      ['Sam', 1, 'gold'],
      ['Bob', 2, 'silver'],
    ]);

    // DNS 不计名次
    await auth(request(srv()).patch(`/entries/${e2.body.id}/result`).send({ resultStatus: 'DNS' })).expect(200);
    const st2 = await auth(request(srv()).get(`/events/${eid}/standings`)).expect(200);
    const rows = st2.body[0].rows;
    expect(rows.find((r: any) => r.name === 'Sam')).toMatchObject({ rank: 1, medal: 'gold' });
    expect(rows.find((r: any) => r.name === 'Bob')).toMatchObject({ rank: null });
  });

  it('Free 建赛 → 402', async () => {
    const free = (
      await request(srv()).post('/auth/register').send({ email: 'm-free@x.com', password: 'ownerpw123', role: 'OWNER' })
    ).body.accessToken;
    await request(srv()).post('/meets').set('Authorization', `Bearer ${free}`).send({ name: 'X', meetDate: '2026-06-30T00:00:00.000Z' }).expect(402);
  });
});
