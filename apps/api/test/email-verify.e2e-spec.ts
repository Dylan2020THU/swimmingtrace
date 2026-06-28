import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { MailService } from '../src/mail/mail.service';

describe('Email verification (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const captured: { url?: string } = {};

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendMail: (o: { text?: string }) => {
          if (o.text?.includes('/verify-email')) captured.url = o.text;
          return Promise.resolve();
        },
        sendPasswordReset: () => Promise.resolve(),
      })
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.refreshToken.deleteMany();
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
  const tokenFrom = (text: string) => new URL(text.match(/https?:\S+/)![0]).searchParams.get('token')!;

  it('注册 → 验证链接 → verify → /auth/me 已验证', async () => {
    captured.url = undefined;
    const reg = await request(srv())
      .post('/auth/register')
      .send({ email: 'o@x.com', password: 'password123', role: 'OWNER' })
      .expect(201);
    expect(captured.url).toContain('/verify-email?token=');
    const token = tokenFrom(captured.url!);

    const me0 = await request(srv()).get('/auth/me').set('Authorization', `Bearer ${reg.body.accessToken}`).expect(200);
    expect(me0.body.emailVerifiedAt).toBeNull();

    await request(srv()).post('/auth/verify-email').send({ token }).expect(201);

    const me1 = await request(srv()).get('/auth/me').set('Authorization', `Bearer ${reg.body.accessToken}`).expect(200);
    expect(me1.body.emailVerifiedAt).toBeTruthy();
  });

  it('无效 token → 400', async () => {
    await request(srv()).post('/auth/verify-email').send({ token: 'bogus' }).expect(400);
  });

  it('认领的游泳者 → 自动已验证', async () => {
    const owner = (await request(srv()).post('/auth/register').send({ email: 'owner2@x.com', password: 'password123', role: 'OWNER' })).body.accessToken;
    const oh = { Authorization: `Bearer ${owner}` };
    const pool = (await request(srv()).post('/pools').set(oh).send({ name: 'P' }).expect(201)).body;
    const sw = (await request(srv()).post(`/pools/${pool.id}/swimmers`).set(oh).send({ email: 'sw@x.com', name: 'Sw' }).expect(201)).body;
    const link = (await request(srv()).post(`/pools/${pool.id}/swimmers/${sw.swimmerId}/claim-link`).set(oh).expect(201)).body;
    const claimed = (await request(srv()).post('/auth/claim').send({ token: link.claimToken, password: 'password123' }).expect(201)).body;
    const me = await request(srv()).get('/auth/me').set('Authorization', `Bearer ${claimed.accessToken}`).expect(200);
    expect(me.body.emailVerifiedAt).toBeTruthy();
  });
});
