import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { MailService } from '../src/mail/mail.service';

describe('Password reset (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const captured: { resetUrl?: string } = {};

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendPasswordReset: (_to: string, url: string) => {
          captured.resetUrl = url;
          return Promise.resolve();
        },
        sendMail: () => Promise.resolve(),
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

  it('forgot 对存在与不存在邮箱都 200（无枚举）；reset 改密 + 旧密码失效', async () => {
    await request(srv())
      .post('/auth/register')
      .send({ email: 'o@x.com', password: 'password123', role: 'OWNER' })
      .expect(201);

    // 不存在邮箱 → 200，且不产生链接（无枚举）
    captured.resetUrl = undefined;
    await request(srv()).post('/auth/forgot-password').send({ email: 'none@x.com' }).expect(201);
    expect(captured.resetUrl).toBeUndefined();

    // 存在 → 200 + 捕获链接
    await request(srv()).post('/auth/forgot-password').send({ email: 'o@x.com' }).expect(201);
    expect(captured.resetUrl).toContain('/reset-password?token=');
    const token = new URL(captured.resetUrl!).searchParams.get('token')!;

    // 重置为新密码
    await request(srv()).post('/auth/reset-password').send({ token, password: 'newpassword456' }).expect(201);

    // 旧密码失败、新密码成功
    await request(srv()).post('/auth/login').send({ email: 'o@x.com', password: 'password123' }).expect(401);
    await request(srv()).post('/auth/login').send({ email: 'o@x.com', password: 'newpassword456' }).expect(201);

    // 复用同一 token → 400
    await request(srv()).post('/auth/reset-password').send({ token, password: 'another789' }).expect(400);
  });

  it('无效 token → 400', async () => {
    await request(srv()).post('/auth/reset-password').send({ token: 'bogus', password: 'password123' }).expect(400);
  });
});
