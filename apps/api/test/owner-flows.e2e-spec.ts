import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Owner flows (e2e)', () => {
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

  afterAll(async () => { await app.close(); });

  const reg = (email: string) =>
    request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123', role: 'OWNER' });

  it('owner A 不能访问 owner B 的泳池 → 403', async () => {
    const a = (await reg('a@x.com')).body.accessToken;
    const b = (await reg('b@x.com')).body.accessToken;
    const poolB = await request(app.getHttpServer()).post('/pools').set('Authorization', `Bearer ${b}`).send({ name: 'B-Pool' }).expect(201);
    await request(app.getHttpServer())
      .get(`/pools/${poolB.body.id}`).set('Authorization', `Bearer ${a}`)
      .expect(403);
  });

  it('建会员 + 代录 happy path', async () => {
    const a = (await reg('owner@x.com')).body.accessToken;
    const pool = await request(app.getHttpServer()).post('/pools').set('Authorization', `Bearer ${a}`).send({ name: 'A-Pool' }).expect(201);
    const swimmer = await request(app.getHttpServer())
      .post(`/pools/${pool.body.id}/swimmers`).set('Authorization', `Bearer ${a}`)
      .send({ name: 'Sam', email: 'sam@x.com' }).expect(201);
    expect(swimmer.body.email).toBe('sam@x.com');
    // Use the current year so this stays within the stats heatmap's current-year
    // window regardless of when it runs (APP_TIMEZONE is UTC in tests).
    const day = `${new Date().getUTCFullYear()}-02-01`;
    await request(app.getHttpServer())
      .post(`/pools/${pool.body.id}/swimmers/${swimmer.body.swimmerId}/sessions`)
      .set('Authorization', `Bearer ${a}`)
      .send({ distanceMeters: 1000, swamAt: `${day}T08:00:00.000Z` }).expect(201);
    const stats = await request(app.getHttpServer())
      .get(`/stats/swimmer/${swimmer.body.swimmerId}`).set('Authorization', `Bearer ${a}`).expect(200);
    expect(stats.body.summary.totalDistanceMeters).toBe(1000);
    // Validates the real heatmap SQL (date_trunc + to_char + AT TIME ZONE) against Postgres.
    expect(stats.body.heatmap).toContainEqual({ date: day, distanceMeters: 1000 });
  });

  it('名册筛选：gender / status / q（服务端）', async () => {
    const a = (await reg('owner3@x.com')).body.accessToken;
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${a}`);
    const pool = (await auth(request(app.getHttpServer()).post('/pools').send({ name: 'F-Pool' })).expect(201)).body;
    await auth(request(app.getHttpServer()).post(`/pools/${pool.id}/swimmers`).send({ email: 'mike@x.com', name: 'Mike', gender: 'MALE', birthDate: '2012-01-01' })).expect(201);
    const fiona = (await auth(request(app.getHttpServer()).post(`/pools/${pool.id}/swimmers`).send({ email: 'fiona@x.com', name: 'Fiona', gender: 'FEMALE', birthDate: '2011-01-01' })).expect(201)).body;
    await auth(request(app.getHttpServer()).patch(`/pools/${pool.id}/swimmers/${fiona.swimmerId}`).send({ status: 'INACTIVE' })).expect(200);

    const males = (await auth(request(app.getHttpServer()).get(`/pools/${pool.id}/swimmers?gender=MALE`)).expect(200)).body;
    expect(males.items.map((s: { email: string }) => s.email)).toEqual(['mike@x.com']);

    const inactive = (await auth(request(app.getHttpServer()).get(`/pools/${pool.id}/swimmers?status=INACTIVE`)).expect(200)).body;
    expect(inactive.items.map((s: { email: string }) => s.email)).toEqual(['fiona@x.com']);

    const search = (await auth(request(app.getHttpServer()).get(`/pools/${pool.id}/swimmers?q=fio`)).expect(200)).body;
    expect(search.items.map((s: { email: string }) => s.email)).toEqual(['fiona@x.com']);
  });
});
