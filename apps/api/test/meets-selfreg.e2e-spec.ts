import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Meets E4 self-registration (e2e)', () => {
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

  /** Register an owner (Pro) and return its access token. */
  const proOwner = async (email: string) => {
    const token = (await request(srv()).post('/auth/register').send({ email, password: 'ownerpw123', role: 'OWNER' })).body.accessToken;
    await prisma.user.update({ where: { email }, data: { plan: 'PRO' } });
    return token;
  };
  /** Provision a swimmer under a pool, claim it, return its access token + id. */
  const claimSwimmer = async (owner: string, poolId: string, email: string, name: string) => {
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${owner}`);
    const sw = (await auth(request(srv()).post(`/pools/${poolId}/swimmers`).send({ email, name })).expect(201)).body;
    const token = (await auth(request(srv()).post(`/pools/${poolId}/swimmers/${sw.swimmerId}/claim-link`)).expect(201)).body.claimToken;
    const accessToken = (await request(srv()).post('/auth/claim').send({ token, password: 'swimmerpw1' }).expect(201)).body.accessToken;
    return { id: sw.swimmerId, accessToken };
  };

  it('开放报名→补资料→自助报名→owner 可见→撤回；缺资料 422', async () => {
    const owner = await proOwner('sr-o@x.com');
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${owner}`);
    const pool = (await auth(request(srv()).post('/pools').send({ name: 'P' })).expect(201)).body;
    const sam = await claimSwimmer(owner, pool.id, 'sam@x.com', 'Sam');
    const swAuth = (r: request.Test) => r.set('Authorization', `Bearer ${sam.accessToken}`);

    const meet = (await auth(request(srv()).post('/meets').send({ name: '夏季公开赛', meetDate: '2026-08-01T00:00:00.000Z' })).expect(201)).body;
    expect(meet.registrationOpen).toBe(false);
    const ev = (await auth(request(srv()).post(`/meets/${meet.id}/events`).send({ distanceMeters: 50, stroke: 'FREE' })).expect(201)).body;

    // Registration is closed → swimmer can't self-register yet (403).
    await swAuth(request(srv()).post(`/me/meets/events/${ev.id}/entries`).send({ seedTimeMs: 30000 })).expect(403);

    // Owner opens registration.
    const open = await auth(request(srv()).post(`/meets/${meet.id}/registration`).send({ registrationOpen: true })).expect(200);
    expect(open.body).toEqual({ registrationOpen: true });

    // Swimmer sees the open meet; no entry yet.
    const mine0 = await swAuth(request(srv()).get('/me/meets')).expect(200);
    expect(mine0.body).toHaveLength(1);
    expect(mine0.body[0]).toMatchObject({ id: meet.id, name: '夏季公开赛' });
    expect(mine0.body[0].events[0]).toMatchObject({ id: ev.id, myEntryId: null });

    // Missing demographics → 422, no entry created.
    await swAuth(request(srv()).post(`/me/meets/events/${ev.id}/entries`).send({ seedTimeMs: 30000 })).expect(422);

    // Fill in profile.
    const prof = await swAuth(request(srv()).patch('/me/profile').send({ gender: 'MALE', birthDate: '2012-03-01T00:00:00.000Z' })).expect(200);
    expect(prof.body).toMatchObject({ gender: 'MALE' });

    // Self-register succeeds.
    const entry = await swAuth(request(srv()).post(`/me/meets/events/${ev.id}/entries`).send({ seedTimeMs: 30000 })).expect(201);
    expect(entry.body).toMatchObject({ swimmerId: sam.id, seedTimeMs: 30000 });

    // Duplicate self-registration → 409.
    await swAuth(request(srv()).post(`/me/meets/events/${ev.id}/entries`).send({ seedTimeMs: 30000 })).expect(409);

    // Owner sees the entry in the roster.
    const list = await auth(request(srv()).get(`/events/${ev.id}/entries`)).expect(200);
    expect(list.body.find((e: { swimmerId: string }) => e.swimmerId === sam.id)).toBeTruthy();

    // /me/meets now reflects my entry.
    const mine1 = await swAuth(request(srv()).get('/me/meets')).expect(200);
    expect(mine1.body[0].events[0]).toMatchObject({ id: ev.id, myEntryId: entry.body.id, mySeedTimeMs: 30000 });

    // Withdraw my own entry.
    await swAuth(request(srv()).delete(`/me/meets/entries/${entry.body.id}`)).expect(200);
    const list2 = await auth(request(srv()).get(`/events/${ev.id}/entries`)).expect(200);
    expect(list2.body.find((e: { swimmerId: string }) => e.swimmerId === sam.id)).toBeFalsy();
  });

  it('非主办方会员自助报名其它 owner 的开放赛事 → 403；不能撤回他人报名 → 403', async () => {
    const owner1 = await proOwner('sr-o1@x.com');
    const owner2 = await proOwner('sr-o2@x.com');
    const a1 = (r: request.Test) => r.set('Authorization', `Bearer ${owner1}`);
    const a2 = (r: request.Test) => r.set('Authorization', `Bearer ${owner2}`);

    const pool1 = (await a1(request(srv()).post('/pools').send({ name: 'P1' })).expect(201)).body;
    const pool2 = (await a2(request(srv()).post('/pools').send({ name: 'P2' })).expect(201)).body;

    // owner1 opens a meet; a member of owner1 registers.
    const meet1 = (await a1(request(srv()).post('/meets').send({ name: 'O1 赛', meetDate: '2026-08-02T00:00:00.000Z' })).expect(201)).body;
    const ev1 = (await a1(request(srv()).post(`/meets/${meet1.id}/events`).send({ distanceMeters: 50, stroke: 'FREE' })).expect(201)).body;
    await a1(request(srv()).post(`/meets/${meet1.id}/registration`).send({ registrationOpen: true })).expect(200);

    const member1 = await claimSwimmer(owner1, pool1.id, 'm1@x.com', 'M1');
    const m1Auth = (r: request.Test) => r.set('Authorization', `Bearer ${member1.accessToken}`);
    await m1Auth(request(srv()).patch('/me/profile').send({ gender: 'FEMALE', birthDate: '2011-01-01T00:00:00.000Z' })).expect(200);
    const ownEntry = await m1Auth(request(srv()).post(`/me/meets/events/${ev1.id}/entries`).send({})).expect(201);

    // A swimmer of owner2 is NOT a member of owner1 → self-register to owner1's event is 403.
    const outsider = await claimSwimmer(owner2, pool2.id, 'out@x.com', 'Out');
    const outAuth = (r: request.Test) => r.set('Authorization', `Bearer ${outsider.accessToken}`);
    await outAuth(request(srv()).patch('/me/profile').send({ gender: 'MALE', birthDate: '2010-06-01T00:00:00.000Z' })).expect(200);
    await outAuth(request(srv()).post(`/me/meets/events/${ev1.id}/entries`).send({})).expect(403);

    // owner1's meet is not visible to the outsider's /me/meets.
    const outMeets = await outAuth(request(srv()).get('/me/meets')).expect(200);
    expect(outMeets.body.find((m: { id: string }) => m.id === meet1.id)).toBeFalsy();

    // Outsider cannot withdraw member1's entry → 403.
    await outAuth(request(srv()).delete(`/me/meets/entries/${ownEntry.body.id}`)).expect(403);
  });
});
