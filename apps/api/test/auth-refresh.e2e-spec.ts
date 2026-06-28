import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Auth refresh (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

  it('登录得双 token；轮换后旧 refresh 失效；复用旧 refresh ⇒ 撤族', async () => {
    const reg = await request(srv())
      .post('/auth/register')
      .send({ email: 'r@x.com', password: 'password123', role: 'OWNER' })
      .expect(201);
    expect(reg.body.accessToken).toBeTruthy();
    expect(reg.body.refreshToken).toBeTruthy();
    const rt0 = reg.body.refreshToken;

    // 轮换 → 新双 token
    const ref1 = await request(srv()).post('/auth/refresh').send({ refreshToken: rt0 }).expect(201);
    const rt1 = ref1.body.refreshToken;
    expect(rt1).toBeTruthy();
    expect(rt1).not.toBe(rt0);

    // 旧 refresh 再用 → 401（且触发撤族）
    await request(srv()).post('/auth/refresh').send({ refreshToken: rt0 }).expect(401);

    // 撤族后 rt1 也连带失效 → 401
    await request(srv()).post('/auth/refresh').send({ refreshToken: rt1 }).expect(401);
  });

  it('logout 撤销当前 refresh；logout-all 撤销全部', async () => {
    const reg = await request(srv())
      .post('/auth/register')
      .send({ email: 'r2@x.com', password: 'password123', role: 'OWNER' })
      .expect(201);
    const refreshToken = reg.body.refreshToken;
    await request(srv()).post('/auth/logout').send({ refreshToken }).expect(201);
    await request(srv()).post('/auth/refresh').send({ refreshToken }).expect(401);

    // 两个会话，logout-all 后都失效
    const a = (await request(srv()).post('/auth/login').send({ email: 'r2@x.com', password: 'password123' }).expect(201)).body;
    const b = (await request(srv()).post('/auth/login').send({ email: 'r2@x.com', password: 'password123' }).expect(201)).body;
    await request(srv()).post('/auth/logout-all').set('Authorization', `Bearer ${a.accessToken}`).expect(201);
    await request(srv()).post('/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
    await request(srv()).post('/auth/refresh').send({ refreshToken: b.refreshToken }).expect(401);
  });
});
