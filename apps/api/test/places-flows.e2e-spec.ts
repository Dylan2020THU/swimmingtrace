import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Nearby places (e2e)', () => {
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

  afterAll(async () => {
    await app.close();
  });

  const srv = () => app.getHttpServer();

  it('附近返回带距离，远处不返回；缺/非法 lat → 400', async () => {
    const owner = (await request(srv()).post('/auth/register').send({ email: 'o@x.com', password: 'password123', role: 'OWNER' })).body.accessToken;
    const oh = { Authorization: `Bearer ${owner}` };
    await request(srv()).post('/pools').set(oh).send({ name: '北京池', latitude: 39.9837, longitude: 116.3164 }).expect(201);

    // 同城近点 → 命中，距离 < 半径
    const near = await request(srv()).get('/places/nearby').query({ lat: 39.99, lng: 116.32, radiusMeters: 5000 }).set(oh).expect(200);
    const hit = near.body.find((p: any) => p.name === '北京池');
    expect(hit).toBeTruthy();
    expect(hit.distanceMeters).toBeLessThan(5000);
    expect(hit.distanceMeters).toBeGreaterThan(0);

    // 远点（上海）半径 5km → 不命中
    const far = await request(srv()).get('/places/nearby').query({ lat: 31.2336, lng: 121.5055, radiusMeters: 5000 }).set(oh).expect(200);
    expect(far.body.find((p: any) => p.name === '北京池')).toBeFalsy();

    // 缺 lng → 400
    await request(srv()).get('/places/nearby').query({ lat: 39.99 }).set(oh).expect(400);
  });
});
