import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Meets E5 records & season points (e2e)', () => {
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

  it('赛季积分累计 + 赛会纪录 + PB + 公开页 PII 安全', async () => {
    const owner = (await request(srv()).post('/auth/register').send({ email: 'rp-o@x.com', password: 'ownerpw123', role: 'OWNER' })).body.accessToken;
    await prisma.user.update({ where: { email: 'rp-o@x.com' }, data: { plan: 'PRO' } });
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${owner}`);

    const pool = (await auth(request(srv()).post('/pools').send({ name: 'P' })).expect(201)).body;
    const a = (await auth(request(srv()).post(`/pools/${pool.id}/swimmers`).send({ email: 'a@x.com', name: 'Ada', gender: 'MALE', birthDate: '2012-03-01' })).expect(201)).body.swimmerId;
    const b = (await auth(request(srv()).post(`/pools/${pool.id}/swimmers`).send({ email: 'b@x.com', name: 'Ben', gender: 'MALE', birthDate: '2012-03-01' })).expect(201)).body.swimmerId;

    const season = (await auth(request(srv()).post('/seasons').send({ name: '2026 春季系列赛', referenceDate: '2026-01-01T00:00:00.000Z' })).expect(201)).body;
    expect(season).toMatchObject({ name: '2026 春季系列赛', meetCount: 0, published: false });

    // Two meets, both in the season; A beats B in each 50 FREE.
    const setupMeet = async (date: string, aTime: number, bTime: number) => {
      const meet = (await auth(request(srv()).post('/meets').send({ name: `赛 ${date}`, meetDate: date })).expect(201)).body;
      const assigned = await auth(request(srv()).post(`/meets/${meet.id}/season`).send({ seasonId: season.id })).expect(200);
      expect(assigned.body).toEqual({ seasonId: season.id, seasonName: '2026 春季系列赛' });
      const ev = (await auth(request(srv()).post(`/meets/${meet.id}/events`).send({ distanceMeters: 50, stroke: 'FREE' })).expect(201)).body;
      const enA = (await auth(request(srv()).post(`/events/${ev.id}/entries`).send({ swimmerId: a })).expect(201)).body;
      const enB = (await auth(request(srv()).post(`/events/${ev.id}/entries`).send({ swimmerId: b })).expect(201)).body;
      await auth(request(srv()).patch(`/entries/${enA.id}/result`).send({ resultStatus: 'OK', resultTimeMs: aTime })).expect(200);
      await auth(request(srv()).patch(`/entries/${enB.id}/result`).send({ resultStatus: 'OK', resultTimeMs: bTime })).expect(200);
    };
    await setupMeet('2026-02-01T00:00:00.000Z', 30000, 31000);
    await setupMeet('2026-03-01T00:00:00.000Z', 30500, 31500);

    // Season points: A wins both (9+9=18), B second both (7+7=14).
    const detail = (await auth(request(srv()).get(`/seasons/${season.id}`)).expect(200)).body;
    expect(detail.meetCount).toBe(2);
    const grp = detail.standings.find((g: any) => g.gender === 'MALE' && g.ageGroup === '13-14');
    expect(grp.rows.map((r: any) => [r.swimmerId, r.points, r.rank])).toEqual([
      [a, 18, 1],
      [b, 14, 2],
    ]);

    // Club records: 50 FREE MALE 13-14 held by A at 30000 (fastest across both meets).
    const records = (await auth(request(srv()).get('/records')).expect(200)).body;
    const rec = records.find((r: any) => r.distanceMeters === 50 && r.stroke === 'FREE' && r.gender === 'MALE' && r.ageGroup === '13-14');
    expect(rec).toMatchObject({ swimmerId: a, timeMs: 30000 });

    // Ada claims her account → /me/records shows PB 30000 flagged as a club record.
    const claimToken = (await auth(request(srv()).post(`/pools/${pool.id}/swimmers/${a}/claim-link`)).expect(201)).body.claimToken;
    const swToken = (await request(srv()).post('/auth/claim').send({ token: claimToken, password: 'swimmerpw1' }).expect(201)).body.accessToken;
    const mine = (await request(srv()).get('/me/records').set('Authorization', `Bearer ${swToken}`).expect(200)).body;
    expect(mine).toEqual([{ distanceMeters: 50, stroke: 'FREE', timeMs: 30000, meetName: '赛 2026-02-01T00:00:00.000Z', meetDate: '2026-02-01T00:00:00.000Z', isClubRecord: true }]);

    // Public projections 404 until published.
    await request(srv()).get(`/public/seasons/${season.id}`).expect(404);

    await auth(request(srv()).post(`/seasons/${season.id}/publish`).send({ published: true })).expect(200);
    const pub = await request(srv()).get(`/public/seasons/${season.id}`).expect(200);
    expect(pub.body).toMatchObject({ id: season.id, name: '2026 春季系列赛' });
    expect(pub.body.standings.find((g: any) => g.ageGroup === '13-14').rows[0]).toMatchObject({ points: 18 });
    expect(JSON.stringify(pub.body)).not.toContain('@'); // no email

    const pubRecords = await request(srv()).get(`/public/seasons/${season.id}/records`).expect(200);
    expect(pubRecords.body.find((r: any) => r.distanceMeters === 50)).toMatchObject({ timeMs: 30000 });
    expect(JSON.stringify(pubRecords.body)).not.toContain('@');

    // Unpublish → public 404 again.
    await auth(request(srv()).post(`/seasons/${season.id}/publish`).send({ published: false })).expect(200);
    await request(srv()).get(`/public/seasons/${season.id}`).expect(404);
  });
});
