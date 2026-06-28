import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { MailService } from '../src/mail/mail.service';

describe('Claim link email (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const captured: { to?: string; url?: string } = {};

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendClaimLink: (to: string, url: string) => {
          captured.to = to;
          captured.url = url;
          return Promise.resolve();
        },
        sendMail: () => Promise.resolve(),
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

  it('生成认领链接 → 返回链接且发信到该游泳者邮箱', async () => {
    const owner = (await request(srv()).post('/auth/register').send({ email: 'o@x.com', password: 'password123', role: 'OWNER' })).body.accessToken;
    const oh = { Authorization: `Bearer ${owner}` };
    const pool = (await request(srv()).post('/pools').set(oh).send({ name: 'P' }).expect(201)).body;
    const sw = (await request(srv()).post(`/pools/${pool.id}/swimmers`).set(oh).send({ email: 'sw@x.com', name: 'Sw' }).expect(201)).body;
    const link = (await request(srv()).post(`/pools/${pool.id}/swimmers/${sw.swimmerId}/claim-link`).set(oh).expect(201)).body;
    expect(link.claimUrl).toContain('/claim/');
    expect(captured.to).toBe('sw@x.com');
    expect(captured.url).toBe(link.claimUrl);
  });
});
