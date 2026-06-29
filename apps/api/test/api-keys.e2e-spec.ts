import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('API keys (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
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

  it('Pro 创建 key→Bearer swk_ 充当 owner→list/lastUsedAt→撤销后 401', async () => {
    const owner = (
      await request(srv()).post('/auth/register').send({ email: 'k-o@x.com', password: 'ownerpw123', role: 'OWNER' })
    ).body.accessToken;
    await prisma.user.update({ where: { email: 'k-o@x.com' }, data: { plan: 'PRO' } }); // API keys 为 Pro 功能
    const jwt = { Authorization: `Bearer ${owner}` };

    // 创建 key，拿明文一次
    const created = await request(srv()).post('/api-keys').set(jwt).send({ label: 'CI' }).expect(201);
    expect(created.body.label).toBe('CI');
    expect(created.body.key).toMatch(/^swk_/);
    expect(created.body.prefix).toBe(created.body.key.slice(0, 12));
    const key = created.body.key;
    const keyAuth = { Authorization: `Bearer ${key}` };

    // 用 key 充当 owner：写（建池）+ 读（列池）
    const pool = await request(srv()).post('/pools').set(keyAuth).send({ name: 'ByKey' }).expect(201);
    const pools = await request(srv()).get('/pools').set(keyAuth).expect(200);
    expect(pools.body.find((p: { id: string }) => p.id === pool.body.id)).toBeTruthy();

    // 列表（用 JWT）：见 prefix，且 lastUsedAt 已记录
    const list = await request(srv()).get('/api-keys').set(jwt).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: created.body.id, label: 'CI', prefix: created.body.prefix });
    expect(list.body[0].lastUsedAt).toBeTruthy();
    expect(JSON.stringify(list.body)).not.toContain(key); // 列表不含明文

    // 撤销
    await request(srv()).delete(`/api-keys/${created.body.id}`).set(jwt).expect(200);
    // 撤销后该 key 失效
    await request(srv()).get('/pools').set(keyAuth).expect(401);
    // 列表已空
    expect((await request(srv()).get('/api-keys').set(jwt).expect(200)).body).toHaveLength(0);
  });

  it('Free 创建 key → 402；坏 swk_ → 401', async () => {
    const free = (
      await request(srv()).post('/auth/register').send({ email: 'k-free@x.com', password: 'ownerpw123', role: 'OWNER' })
    ).body.accessToken;
    await request(srv()).post('/api-keys').set('Authorization', `Bearer ${free}`).send({ label: 'x' }).expect(402);

    await request(srv()).get('/pools').set('Authorization', 'Bearer swk_totally-bogus').expect(401);
  });
});
